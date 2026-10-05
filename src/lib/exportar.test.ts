import { describe, expect, it } from 'vitest';

import { minutosJornada } from './calculo';
import {
  BOM_UTF8,
  generarCSV,
  generarCopia,
  generarResumen,
  leerCopia,
  nombreArchivo,
  rangoMes,
  validarAjustes,
} from './exportar';
import { instanteLocal } from './parseo';
import { AJUSTES_POR_DEFECTO, type Ajustes, type Jornada, type TipoDia } from './tipos';

const HOY = '2026-10-01';
const AHORA = instanteLocal(HOY, '12:00')!;

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
      inicio: instanteLocal(fecha, inicio)!,
      fin: fin === null ? null : instanteLocal(fecha, fin)!,
    })),
  };
}

/** Convierte el CSV en filas ya troceadas, sin la marca de orden de bytes. */
function filasCSV(csv: string): string[][] {
  return csv
    .replace(BOM_UTF8, '')
    .trim()
    .split('\n')
    .map((linea) => linea.split(';'));
}

describe('generarCSV', () => {
  const jornadas = [
    jornada('2026-09-30', [
      ['09:00', '13:30'],
      ['16:00', '20:00'],
    ]),
    jornada('2026-10-01', [['09:00', null]]),
  ];

  it('empieza con la marca de orden de bytes para que Excel respete los acentos', () => {
    expect(generarCSV(jornadas, '2026-09-01', '2026-10-31', HOY, AHORA).startsWith(BOM_UTF8)).toBe(
      true,
    );
  });

  it('incluye la cabecera y una fila por tramo', () => {
    const filas = filasCSV(generarCSV(jornadas, '2026-09-01', '2026-10-31', HOY, AHORA));
    expect(filas[0]).toEqual([
      'Fecha',
      'Tipo',
      'Inicio',
      'Fin',
      'Minutos',
      'Minutos del dia',
      'Nota',
    ]);
    expect(filas).toHaveLength(4); // cabecera + 2 tramos + 1 en curso
  });

  it('marca el tramo de hoy como en curso y calcula sus minutos', () => {
    const csv = generarCSV(jornadas, '2026-09-01', '2026-10-31', HOY, AHORA);
    expect(csv).toContain('2026-10-01;Laborable;09:00;en curso;180;180;');
  });

  it('no computa un tramo abierto de un día anterior', () => {
    const olvidada = jornada('2026-09-29', [['09:00', null]]);
    const csv = generarCSV([olvidada], '2026-09-01', '2026-10-31', HOY, AHORA);
    expect(csv).toContain('2026-09-29;Laborable;09:00;sin cerrar;0;0;');
  });

  it('filtra por rango de fechas', () => {
    const csv = generarCSV(jornadas, '2026-10-01', '2026-10-31', HOY, AHORA);
    expect(csv).not.toContain('2026-09-30');
    expect(csv).toContain('2026-10-01');
  });

  it('la columna «Minutos del dia» coincide con el motor, tramo a tramo', () => {
    // Regresión: antes el CSV redondeaba por su cuenta y sumaba un minuto de más.
    const conFraccion = jornada('2026-09-30', [
      ['09:00:00', '13:30:20'],
      ['16:00:00', '20:30:20'],
    ]);
    // Se reescriben los instantes con segundos, que es donde aparece la fracción.
    const conSegundos: Jornada = {
      fecha: '2026-09-30',
      tipo: 'laborable',
      tramos: [
        {
          id: 'a',
          inicio: instanteLocal('2026-09-30', '09:00:00')!,
          fin: instanteLocal('2026-09-30', '13:30:20')!,
        },
        {
          id: 'b',
          inicio: instanteLocal('2026-09-30', '16:00:00')!,
          fin: instanteLocal('2026-09-30', '20:30:20')!,
        },
      ],
    };
    expect(conFraccion.tramos).toHaveLength(2);

    const filas = filasCSV(generarCSV([conSegundos], '2026-09-01', '2026-09-30', HOY, AHORA)).slice(
      1,
    );
    const motor = minutosJornada(conSegundos, HOY, AHORA);

    for (const fila of filas) {
      expect(Number(fila[5])).toBe(motor);
    }
  });

  it('la suma de los totales diarios coincide con el resumen exportado', () => {
    const rango = { desde: '2026-09-01', hasta: '2026-10-31' };
    const filas = filasCSV(generarCSV(jornadas, rango.desde, rango.hasta, HOY, AHORA)).slice(1);

    // Un total por día, sin repetir.
    const porDia = new Map(filas.map((fila) => [fila[0], Number(fila[5])]));
    const sumaCSV = [...porDia.values()].reduce((total, m) => total + m, 0);
    const resumen = generarResumen(
      jornadas,
      AJUSTES_POR_DEFECTO,
      rango.desde,
      rango.hasta,
      HOY,
      AHORA,
    );

    expect(sumaCSV).toBe(resumen.minutosTotales);
  });

  it('neutraliza las fórmulas en las notas', () => {
    const conFormula: Jornada = {
      ...jornada('2026-09-30', [['09:00', '10:00']]),
      nota: '=HYPERLINK("http://malo.example","pulsa")',
    };
    const csv = generarCSV([conFormula], '2026-09-01', '2026-10-31', HOY, AHORA);
    expect(csv).not.toContain(';=HYPERLINK');
    expect(csv).toContain('"\'=HYPERLINK(""http://malo.example"",""pulsa"")"');
  });

  it('escapa las notas que contienen el separador o comillas', () => {
    const conNota: Jornada = {
      ...jornada('2026-09-30', [['09:00', '10:00']]),
      nota: 'Inventario; pasillo "A"',
    };
    const csv = generarCSV([conNota], '2026-09-01', '2026-10-31', HOY, AHORA);
    expect(csv).toContain('"Inventario; pasillo ""A"""');
  });

  it('incluye los días sin tramos con cero minutos', () => {
    const festivo = jornada('2026-09-30', [], 'festivo');
    const csv = generarCSV([festivo], '2026-09-01', '2026-10-31', HOY, AHORA);
    expect(csv).toContain('2026-09-30;Festivo;;;0;0;');
  });
});

describe('generarResumen', () => {
  it('suma los minutos y los días trabajados del rango', () => {
    const jornadas = [
      jornada('2026-09-28', [['09:00', '13:30']]), // 270
      jornada('2026-09-29', [['09:00', '17:00']]), // 480
      jornada('2026-09-30', [], 'festivo'),
    ];
    const resumen = generarResumen(
      jornadas,
      AJUSTES_POR_DEFECTO,
      '2026-09-01',
      '2026-09-30',
      HOY,
      AHORA,
    );
    expect(resumen.minutosTotales).toBe(750);
    expect(resumen.diasTrabajados).toBe(2);
    expect(resumen.semanas).toHaveLength(1);
  });

  it('el extra solo cuenta el de las semanas ya cerradas', () => {
    const semanaCerrada = [
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ].map((fecha, i) => jornada(fecha, [['08:00', i === 0 ? '16:30' : '16:00']]));
    const resumen = generarResumen(
      semanaCerrada,
      AJUSTES_POR_DEFECTO,
      '2026-09-01',
      '2026-09-30',
      HOY,
      AHORA,
    );
    expect(resumen.minutosTotales).toBe(2430);
    expect(resumen.minutosExtra).toBe(30);
  });
});

describe('leerCopia: validación profunda', () => {
  const jornadas = [jornada('2026-09-30', [['09:00', '13:30']])];

  it('se puede exportar y volver a leer sin perder datos', () => {
    const lectura = leerCopia(generarCopia(jornadas, AJUSTES_POR_DEFECTO, AHORA));
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas).toHaveLength(1);
    expect(lectura.copia.jornadas[0]!.fecha).toBe('2026-09-30');
    expect(lectura.copia.ajustes?.horasDia).toBe(8);
  });

  it('rechaza un archivo que no es JSON', () => {
    const lectura = leerCopia('esto no es json');
    expect(lectura.ok).toBe(false);
  });

  it('rechaza un JSON que no es una copia de Jornada', () => {
    expect(leerCopia('{"foo":1}').ok).toBe(false);
    expect(leerCopia('{"jornadas":"nope"}').ok).toBe(false);
    expect(leerCopia('null').ok).toBe(false);
  });

  it('rechaza una fecha con formato correcto pero que no existe', () => {
    // Regresión: esta fecha dejaba la app rota en cada arranque.
    const lectura = leerCopia(
      JSON.stringify({ jornadas: [{ fecha: '2026-02-31', tramos: [], tipo: 'laborable' }] }),
    );
    expect(lectura.ok).toBe(false);
    if (!lectura.ok) expect(lectura.error).toMatch(/fecha válida/i);
  });

  it('descarta las jornadas con forma inválida y lo cuenta', () => {
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          { fecha: 'mal', tramos: [] },
          { fecha: '2026-09-30', tramos: [] },
          'ni siquiera es un objeto',
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas).toHaveLength(1);
    expect(lectura.copia.jornadas[0]!.fecha).toBe('2026-09-30');
    expect(lectura.copia.descartadas).toBe(2);
    expect(lectura.copia.avisos.join(' ')).toMatch(/descartadas/i);
  });

  it('descarta los tramos con horas imposibles', () => {
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            tramos: [
              { inicio: 'ayer', fin: null },
              { inicio: 1, fin: 'xyz' },
              { inicio: 1000, fin: 500 }, // el fin precede al inicio
              { inicio: 'NaN', fin: null },
              {
                inicio: instanteLocal('2026-09-30', '09:00')!,
                fin: instanteLocal('2026-09-30', '10:00')!,
              },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas[0]!.tramos).toHaveLength(1);
    expect(lectura.copia.avisos.join(' ')).toMatch(/tramos descartados/i);
  });

  it('corrige un tipo de día desconocido en lugar de romper el CSV', () => {
    const lectura = leerCopia(
      JSON.stringify({ jornadas: [{ fecha: '2026-09-30', tramos: [], tipo: 'inventado' }] }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas[0]!.tipo).toBe('laborable');
  });

  it('conserva la última jornada cuando hay fechas repetidas', () => {
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          { fecha: '2026-09-30', tipo: 'laborable', tramos: [] },
          {
            fecha: '2026-09-30',
            tipo: 'festivo',
            tramos: [
              {
                inicio: instanteLocal('2026-09-30', '09:00')!,
                fin: instanteLocal('2026-09-30', '10:00')!,
              },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas).toHaveLength(1);
    expect(lectura.copia.jornadas[0]!.tipo).toBe('festivo');
    expect(lectura.copia.duplicadas).toBe(1);
  });

  it('ordena los tramos al normalizar', () => {
    const tarde = instanteLocal('2026-09-30', '16:00')!;
    const manana = instanteLocal('2026-09-30', '09:00')!;
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tramos: [
              { inicio: tarde, fin: tarde + 3600_000 },
              { inicio: manana, fin: manana + 3600_000 },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    const tramos = lectura.copia.jornadas[0]!.tramos;
    expect(tramos[0]!.inicio).toBeLessThan(tramos[1]!.inicio);
  });

  it('acepta una copia sin jornadas', () => {
    const lectura = leerCopia(JSON.stringify({ version: 1, jornadas: [] }));
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas).toHaveLength(0);
  });

  it('renombra los ids de tramo repetidos, que romperían el render', () => {
    // Regresión: Svelte lanza con claves duplicadas en una lista, y eso dejaba
    // la pantalla de Hoy sin renderizar y sin forma de arreglarlo desde dentro.
    const a = instanteLocal('2026-09-30', '09:00')!;
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            tramos: [
              { id: 'repetido', inicio: a, fin: a + 3_600_000 },
              { id: 'repetido', inicio: a + 7_200_000, fin: a + 10_800_000 },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;

    const ids = lectura.copia.jornadas[0]!.tramos.map((tramo) => tramo.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(lectura.copia.idsRenombrados).toBe(1);
    expect(lectura.copia.avisos.join(' ')).toMatch(/identificador repetido/i);
  });

  it('descarta los instantes que no caen en el día de su jornada', () => {
    // Regresión: {inicio: 0, fin: 1760000000000} sumaba 29 millones de minutos.
    const inicio = instanteLocal('2026-09-30', '09:00')!;
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            tramos: [
              // Duración absurda: lo descarta la cota de 24 h.
              { inicio: 0, fin: 1_760_000_000_000 },
              // Duración creíble pero en 1970: solo lo descarta la cota del día.
              { inicio: 0, fin: 3_600_000 },
              // Este es el único válido.
              { inicio, fin: inicio + 3_600_000 },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;

    expect(lectura.copia.jornadas[0]!.tramos).toHaveLength(1);
    expect(lectura.copia.avisos.join(' ')).toMatch(/tramo(s)? descartado/i);
  });

  it('descarta un tramo que dura más de 24 horas', () => {
    const inicio = instanteLocal('2026-09-30', '09:00')!;
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            tramos: [{ inicio, fin: inicio + 25 * 3_600_000 }],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas[0]!.tramos).toHaveLength(0);
  });

  it('acepta un turno que cruza medianoche', () => {
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            tramos: [
              {
                inicio: instanteLocal('2026-09-30', '22:00')!,
                fin: instanteLocal('2026-10-01', '01:00')!,
              },
            ],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas[0]!.tramos).toHaveLength(1);
  });

  it('recorta las notas desmedidas', () => {
    const inicio = instanteLocal('2026-09-30', '09:00')!;
    const lectura = leerCopia(
      JSON.stringify({
        jornadas: [
          {
            fecha: '2026-09-30',
            tipo: 'laborable',
            nota: 'x'.repeat(5000),
            tramos: [{ inicio, fin: inicio + 3_600_000 }],
          },
        ],
      }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.jornadas[0]!.nota).toHaveLength(500);
  });
});

describe('ajustes de la copia', () => {
  it('rechaza unos ajustes sin días laborables y conserva los del usuario', () => {
    // Regresión: diasLaborables null tumbaba todas las pantallas.
    const lectura = leerCopia(
      JSON.stringify({ jornadas: [], ajustes: { ...AJUSTES_POR_DEFECTO, diasLaborables: null } }),
    );
    expect(lectura.ok).toBe(true);
    if (!lectura.ok) return;
    expect(lectura.copia.ajustes).toBeNull();
    expect(lectura.copia.avisos.join(' ')).toMatch(/ajustes/i);
  });

  it('rechaza horas fuera de rango o tipos equivocados', () => {
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, horasDia: '8' })).toBeNull();
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, horasDia: 0 })).toBeNull();
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, horasSemana: 500 })).toBeNull();
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, margenAvisoMin: null })).toBeNull();
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, diasLaborables: [] })).toBeNull();
    expect(validarAjustes({ ...AJUSTES_POR_DEFECTO, diasLaborables: [0, 8] })).toBeNull();
    expect(validarAjustes(AJUSTES_POR_DEFECTO)).toEqual(AJUSTES_POR_DEFECTO);
  });

  it('normaliza los ajustes válidos: días únicos y ordenados', () => {
    const ajustes: Ajustes = { ...AJUSTES_POR_DEFECTO, diasLaborables: [5, 1, 5, 3] };
    expect(validarAjustes(ajustes)?.diasLaborables).toEqual([1, 3, 5]);
  });
});

describe('utilidades de archivo', () => {
  it('nombra los archivos con la fecha', () => {
    expect(nombreArchivo('fichaje-copia', 'json', '2026-10-01')).toBe(
      'fichaje-copia-2026-10-01.json',
    );
  });

  it('calcula el mes natural', () => {
    expect(rangoMes('2026-10-15')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(rangoMes('2026-10-15', -1)).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
  });

  it('acierta con febrero en año bisiesto', () => {
    expect(rangoMes('2028-02-10')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(rangoMes('2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
  });

  it('cruza el cambio de año en los dos sentidos', () => {
    expect(rangoMes('2026-01-15', -1)).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(rangoMes('2026-12-15', 1)).toEqual({ desde: '2027-01-01', hasta: '2027-01-31' });
  });

  it('lanza con una fecha imposible', () => {
    expect(() => rangoMes('2026-02-31')).toThrow(/Fecha inválida/);
  });
});
