import { describe, expect, it } from 'vitest';

import {
  esOlvido,
  minutosJornada,
  minutosObjetivoDia,
  minutosTramo,
  olvidos,
  resumenDia,
  resumenSemana,
  saldoExtras,
  situacionActual,
} from './calculo';
import { diasEntre, fechasDeSemana, lunesDe, sumarDias } from './fechas';
import { formatearMinutos, formatearSaldo } from './formato';
import { instanteLocal } from './parseo';
import { AJUSTES_POR_DEFECTO, type Ajustes, type Jornada, type TipoDia } from './tipos';

/** Semana de referencia: lunes 28 sep 2026 a domingo 4 oct 2026. */
const LUNES = '2026-09-28';
const DOMINGO = '2026-10-04';

const AJUSTES: Ajustes = AJUSTES_POR_DEFECTO;

function ts(fecha: string, hora: string): number {
  const instante = instanteLocal(fecha, hora);
  if (instante === null) throw new Error(`Instante inválido en el test: ${fecha} ${hora}`);
  return instante;
}

function jornada(
  fecha: string,
  tramos: [string, string | null][],
  tipo: TipoDia = 'laborable',
): Jornada {
  return {
    fecha,
    tipo,
    tramos: tramos.map(([inicio, fin], i) => ({
      id: `${fecha}-${i}`,
      inicio: ts(fecha, inicio),
      fin: fin === null ? null : ts(fecha, fin),
    })),
  };
}

/** Jornada partida estándar: mañana 4 h 30 min y tarde 4 h. */
function jornadaCompleta(fecha: string, tipo: TipoDia = 'laborable'): Jornada {
  return jornada(
    fecha,
    [
      ['09:00', '13:30'],
      ['16:00', '20:00'],
    ],
    tipo,
  );
}

/** Un día laborable con los minutos exactos que se pidan (múltiplos de 30). */
function jornadaDeMinutos(fecha: string, minutos: number, tipo: TipoDia = 'laborable'): Jornada {
  const inicio = ts(fecha, '08:00');
  return {
    fecha,
    tipo,
    tramos: [{ id: `${fecha}-0`, inicio, fin: inicio + minutos * 60_000 }],
  };
}

describe('suma de tramos', () => {
  it('suma mañana y tarde de una jornada partida', () => {
    const j = jornadaCompleta(LUNES);
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(510); // 8 h 30 min
  });

  it('redondea cada intervalo al minuto y los suma', () => {
    const abajo = jornada(LUNES, [['09:00:00', '13:30:20']]);
    const arriba = jornada(LUNES, [['09:00:00', '13:30:40']]);
    const ahora = ts(LUNES, '23:00');
    expect(minutosJornada(abajo, LUNES, ahora)).toBe(270);
    expect(minutosJornada(arriba, LUNES, ahora)).toBe(271);
  });

  it('aplica la misma regla de redondeo en todas partes', () => {
    // Dos tramos de 270 min 20 s: redondear cada uno da 270 + 270 = 540,
    // mientras que redondear el total daría 541. La regla única es la primera,
    // así que el CSV, el PDF y la app no pueden discrepar.
    const j = jornada(LUNES, [
      ['09:00:00', '13:30:20'],
      ['16:00:00', '20:30:20'],
    ]);
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(540);
  });

  it('cuenta el tramo abierto de hoy hasta la hora actual', () => {
    const j = jornada(LUNES, [
      ['09:00', '13:30'],
      ['16:00', null],
    ]);
    expect(minutosJornada(j, LUNES, ts(LUNES, '17:15'))).toBe(270 + 75);
  });

  it('no computa un tramo abierto de un día anterior', () => {
    const ayer = jornada('2026-09-27', [['09:00', null]]);
    expect(minutosJornada(ayer, LUNES, ts(LUNES, '10:00'))).toBe(0);
  });
});

describe('tramos solapados', () => {
  it('dos tramos que se pisan cuentan una sola vez', () => {
    // 09:00-13:00 y 12:00-14:00: sumando a lo bruto darían 360 min, pero el
    // reloj solo abarca de 09:00 a 14:00, así que son 300.
    const j = jornada(LUNES, [
      ['09:00', '13:00'],
      ['12:00', '14:00'],
    ]);
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(300);
  });

  it('fusiona cadenas de solapes y conserva lo que no se pisa', () => {
    const j = jornada(LUNES, [
      ['09:00', '11:00'],
      ['10:00', '12:00'],
      ['11:30', '13:00'],
      ['16:00', '17:00'],
    ]);
    // La cadena 09:00-13:00 son 240 min, más 60 por la tarde.
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(300);
  });

  it('un tramo exactamente contiguo no se cuenta dos veces', () => {
    const j = jornada(LUNES, [
      ['09:00', '13:00'],
      ['13:00', '15:00'],
    ]);
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(360);
  });

  it('un tramo con el fin antes del inicio cuenta cero, nunca resta', () => {
    const j = jornada(LUNES, [['18:00', '09:00']]);
    expect(minutosJornada(j, LUNES, ts(LUNES, '23:00'))).toBe(0);
  });

  it('un tramo abierto que empieza en el futuro no resta tiempo', () => {
    const j = jornada(LUNES, [
      ['09:00', '13:00'],
      ['18:00', null],
    ]);
    // Son las 14:00 y el tramo abierto aún no ha empezado.
    expect(minutosJornada(j, LUNES, ts(LUNES, '14:00'))).toBe(240);
    expect(minutosTramo(j.tramos[1]!, ts(LUNES, '14:00'))).toBe(0);
  });
});

describe('olvidos', () => {
  it('detecta el tramo sin cerrar de un día anterior', () => {
    const ayer = jornada('2026-09-27', [
      ['09:00', '13:30'],
      ['16:00', null],
    ]);
    expect(esOlvido(ayer, ayer.tramos[1]!, LUNES)).toBe(true);
    expect(olvidos([ayer], LUNES)).toHaveLength(1);
  });

  it('no marca como olvido el tramo abierto de hoy', () => {
    const hoy = jornada(LUNES, [['09:00', null]]);
    expect(esOlvido(hoy, hoy.tramos[0]!, LUNES)).toBe(false);
    expect(olvidos([hoy], LUNES)).toHaveLength(0);
  });

  it('los devuelve del más antiguo al más reciente', () => {
    const viejo = jornada('2026-09-25', [['09:00', null]]);
    const reciente = jornada('2026-09-27', [['09:00', null]]);
    const pendientes = olvidos([reciente, viejo], LUNES);
    expect(pendientes.map((p) => p.jornada.fecha)).toEqual(['2026-09-25', '2026-09-27']);
  });

  it('ignora los tramos ya cerrados', () => {
    const j = jornadaCompleta('2026-09-25');
    expect(olvidos([j], LUNES)).toHaveLength(0);
  });
});

describe('objetivo semanal ajustado', () => {
  it('cinco días laborables dan 40 h', () => {
    const resumen = resumenSemana([], AJUSTES, LUNES, LUNES, ts(LUNES, '12:00'));
    expect(resumen.minutosObjetivo).toBe(2400);
    expect(resumen.diasComputables).toBe(5);
  });

  it('un festivo baja el objetivo a 32 h y a cuatro días', () => {
    const jueves = '2026-10-01';
    const jornadas = [jornadaCompleta(jueves, 'festivo')];
    const resumen = resumenSemana(jornadas, AJUSTES, LUNES, '2026-10-05', ts(LUNES, '12:00'));
    expect(resumen.minutosObjetivo).toBe(1920);
    expect(resumen.diasComputables).toBe(4);
  });

  it('las vacaciones no cuentan para el objetivo', () => {
    const martes = '2026-09-29';
    const jornadas = [jornadaCompleta(martes, 'vacaciones')];
    const resumen = resumenSemana(jornadas, AJUSTES, LUNES, '2026-10-05', ts(LUNES, '12:00'));
    expect(resumen.minutosObjetivo).toBe(1920);
  });

  it('el fin de semana no aporta objetivo', () => {
    const sabado = '2026-10-03';
    expect(minutosObjetivoDia(AJUSTES, sabado, 'laborable')).toBe(0);
  });

  it('las horas de fin de semana suman como trabajadas pero no generan extra por sí solas', () => {
    const sabado = '2026-10-03';
    const soloSabado = resumenSemana(
      [jornadaDeMinutos(sabado, 240)],
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(soloSabado.minutosTrabajados).toBe(240);
    // El extra es semanal: 4 h sueltas no superan el objetivo de 40 h.
    expect(soloSabado.minutosExtra).toBe(0);
  });

  it('trabajar el sábado además de la semana completa sí genera extra', () => {
    const sabado = '2026-10-03';
    const semanaCompleta = [
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ].map((fecha) => jornadaDeMinutos(fecha, 480));
    const resumen = resumenSemana(
      [...semanaCompleta, jornadaDeMinutos(sabado, 240)],
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(resumen.minutosTrabajados).toBe(2640);
    expect(resumen.minutosExtra).toBe(240);
    expect(resumen.estado).toBe('excedido');
  });

  it('respeta días laborables distintos a lunes-viernes', () => {
    const ajustes: Ajustes = { ...AJUSTES, diasLaborables: [2, 3, 4, 5, 6] };
    const resumen = resumenSemana([], ajustes, LUNES, LUNES, ts(LUNES, '12:00'));
    expect(resumen.diasComputables).toBe(5);
    expect(minutosObjetivoDia(ajustes, LUNES, 'laborable')).toBe(0); // lunes ya no es laborable
  });

  it('permite cambiar las horas del día para el objetivo diario', () => {
    const ajustes: Ajustes = { ...AJUSTES, horasDia: 6 };
    expect(minutosObjetivoDia(ajustes, LUNES, 'laborable')).toBe(360);
  });

  it('el límite de horas semanales manda en el objetivo de la semana', () => {
    // Regresión: horasSemana no lo usaba nadie, así que el control no hacía nada.
    const con = (horasSemana: number) =>
      resumenSemana([], { ...AJUSTES, horasSemana }, LUNES, LUNES, ts(LUNES, '12:00'))
        .minutosObjetivo;

    expect(con(40)).toBe(2400);
    expect(con(30)).toBe(1800);
    expect(con(60)).toBe(3600);
  });

  it('el objetivo semanal se reparte entre los días laborables configurados', () => {
    const seisDias: Ajustes = { ...AJUSTES, diasLaborables: [1, 2, 3, 4, 5, 6], horasSemana: 48 };
    const resumen = resumenSemana([], seisDias, LUNES, LUNES, ts(LUNES, '12:00'));
    expect(resumen.diasComputables).toBe(6);
    expect(resumen.minutosObjetivo).toBe(2880);
  });
});

describe('extra y semáforo', () => {
  const semanaTrabajada = (minutosPorDia: number[]): Jornada[] =>
    ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((fecha, i) =>
      jornadaDeMinutos(fecha, minutosPorDia[i] ?? 480),
    );

  it('suma la semana exacta sin extra', () => {
    const resumen = resumenSemana(
      semanaTrabajada([480, 480, 480, 480, 480]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(resumen.minutosTrabajados).toBe(2400);
    expect(resumen.minutosExtra).toBe(0);
    expect(resumen.estado).toBe('bien');
  });

  it('el extra es exacto al minuto', () => {
    const resumen = resumenSemana(
      semanaTrabajada([485, 480, 480, 480, 480]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(resumen.minutosExtra).toBe(5);
    expect(resumen.estado).toBe('aviso'); // dentro del margen de 10 min
  });

  it('avisa en cuanto el exceso supera el margen', () => {
    const resumen = resumenSemana(
      semanaTrabajada([491, 480, 480, 480, 480]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(resumen.minutosExtra).toBe(11);
    expect(resumen.estado).toBe('excedido');
  });

  it('nunca devuelve extra negativo', () => {
    const resumen = resumenSemana(
      semanaTrabajada([240, 240, 240, 240, 240]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(resumen.minutosTrabajados).toBe(1200);
    expect(resumen.minutosExtra).toBe(0);
  });

  it('el borde del margen es exacto: justo en el margen todavía avisa', () => {
    // Margen de 10 min. Exceso de 10 entra en «aviso»; 11 ya es «excedido».
    const enElMargen = resumenSemana(
      semanaTrabajada([490, 480, 480, 480, 480]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(enElMargen.minutosExtra).toBe(10);
    expect(enElMargen.estado).toBe('aviso');

    const sinExceso = resumenSemana(
      semanaTrabajada([480, 480, 480, 480, 480]),
      AJUSTES,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(sinExceso.minutosExtra).toBe(0);
    expect(sinExceso.estado).toBe('bien');
  });

  it('un margen de cero avisa al primer minuto de más', () => {
    const sinMargen: Ajustes = { ...AJUSTES, margenAvisoMin: 0 };
    const unMinuto = resumenSemana(
      semanaTrabajada([481, 480, 480, 480, 480]),
      sinMargen,
      LUNES,
      '2026-10-05',
      ts(LUNES, '12:00'),
    );
    expect(unMinuto.minutosExtra).toBe(1);
    expect(unMinuto.estado).toBe('excedido');
  });
});

describe('semana cerrada', () => {
  it('no está cerrada mientras dura', () => {
    expect(resumenSemana([], AJUSTES, LUNES, DOMINGO, 0).cerrada).toBe(false);
  });

  it('está cerrada al día siguiente del domingo', () => {
    expect(resumenSemana([], AJUSTES, LUNES, '2026-10-05', 0).cerrada).toBe(true);
  });
});

describe('saldo acumulado de extras', () => {
  /** Semana completa de lunes a viernes con los minutos de más indicados. */
  function semanaConExtra(lunes: string, minutosExtra: number): Jornada[] {
    return [0, 1, 2, 3, 4].map((offset) =>
      jornadaDeMinutos(sumarDias(lunes, offset), offset === 0 ? 480 + minutosExtra : 480),
    );
  }

  // Semana 21-27 sep, ya cerrada, con 60 min de más.
  const semanaAnterior = semanaConExtra('2026-09-21', 60);
  // Semana en curso (empieza el lunes de referencia), con 30 min de más.
  const semanaEnCurso = semanaConExtra(LUNES, 30);

  it('solo las semanas cerradas suman al saldo firme', () => {
    const saldo = saldoExtras(
      [...semanaAnterior, ...semanaEnCurso],
      AJUSTES,
      LUNES,
      ts(LUNES, '12:00'),
    );
    expect(saldo.minutos).toBe(60);
    expect(saldo.provisional).toBe(30);
    expect(saldo.semanas).toBe(1);
  });

  it('sin jornadas el saldo es cero', () => {
    expect(saldoExtras([], AJUSTES, LUNES, 0)).toEqual({ minutos: 0, provisional: 0, semanas: 0 });
  });

  it('acumula varias semanas cerradas', () => {
    const otra = semanaConExtra('2026-09-14', 45);
    const saldo = saldoExtras([...otra, ...semanaAnterior], AJUSTES, LUNES, ts(LUNES, '12:00'));
    expect(saldo.minutos).toBe(105);
    expect(saldo.semanas).toBe(2);
  });

  it('no cuenta las semanas sin exceso', () => {
    const exacta = semanaConExtra('2026-09-14', 0);
    const saldo = saldoExtras(exacta, AJUSTES, LUNES, ts(LUNES, '12:00'));
    expect(saldo.minutos).toBe(0);
    expect(saldo.provisional).toBe(0);
  });
});

describe('situación de fichaje', () => {
  it('sin jornada está fuera', () => {
    expect(situacionActual(undefined)).toBe('fuera');
    expect(situacionActual(jornada(LUNES, []))).toBe('fuera');
  });

  it('con un tramo abierto está trabajando', () => {
    expect(situacionActual(jornada(LUNES, [['09:00', null]]))).toBe('trabajando');
  });

  it('con todos los tramos cerrados está en pausa', () => {
    expect(situacionActual(jornada(LUNES, [['09:00', '13:30']]))).toBe('en-pausa');
  });
});

describe('resumen del día', () => {
  it('calcula minutos y objetivo del día', () => {
    const j = jornadaDeMinutos(LUNES, 500);
    const dia = resumenDia(j, AJUSTES, LUNES, ts(LUNES, '23:00'));
    expect(dia.minutos).toBe(500);
    expect(dia.objetivo).toBe(480);
  });

  it('sin jornada el día está a cero', () => {
    const dia = resumenDia(undefined, AJUSTES, LUNES, ts(LUNES, '23:00'));
    expect(dia.minutos).toBe(0);
    expect(dia.objetivo).toBe(480);
  });

  it('en un festivo el objetivo es cero', () => {
    const j = jornadaDeMinutos(LUNES, 120, 'festivo');
    const dia = resumenDia(j, AJUSTES, LUNES, ts(LUNES, '23:00'));
    expect(dia.minutos).toBe(120);
    expect(dia.objetivo).toBe(0);
  });
});

describe('aritmética de fechas', () => {
  it('el lunes de un domingo es el lunes anterior', () => {
    expect(lunesDe(DOMINGO)).toBe(LUNES);
    expect(lunesDe(LUNES)).toBe(LUNES);
  });

  it('una semana tiene siete fechas', () => {
    const fechas = fechasDeSemana(LUNES);
    expect(fechas).toHaveLength(7);
    expect(fechas[0]).toBe(LUNES);
    expect(fechas[6]).toBe(DOMINGO);
  });

  it('el cambio de hora no se come ni duplica días', () => {
    // En 2026 el horario de verano cambia el domingo 29 de marzo.
    expect(sumarDias('2026-03-29', 1)).toBe('2026-03-30');
    expect(diasEntre('2026-03-28', '2026-03-30')).toBe(2);
    expect(lunesDe('2026-03-30')).toBe('2026-03-30');
    // Y el de invierno, el domingo 25 de octubre.
    expect(sumarDias('2026-10-24', 1)).toBe('2026-10-25');
    expect(sumarDias('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('un día de ocho horas sigue siendo ocho horas en la semana del cambio', () => {
    const lunes = '2026-03-30';
    const j = jornadaDeMinutos(lunes, 480);
    expect(minutosJornada(j, lunes, ts(lunes, '23:00'))).toBe(480);
  });
});

describe('formato de cifras', () => {
  it('formatea minutos con dos dígitos', () => {
    expect(formatearMinutos(510)).toBe('8h 30m');
    expect(formatearMinutos(5)).toBe('0h 05m');
    expect(formatearMinutos(0)).toBe('0h 00m');
    expect(formatearMinutos(1440)).toBe('24h 00m');
  });

  it('formatea saldos con signo', () => {
    expect(formatearSaldo(405)).toBe('+6h 45m');
    expect(formatearSaldo(0)).toBe('0h 00m');
    expect(formatearSaldo(-80)).toBe('−1h 20m');
  });
});
