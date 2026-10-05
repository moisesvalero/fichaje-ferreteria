/**
 * Motor de cálculo del fichaje.
 *
 * Es la pieza crítica de la aplicación y por eso es pura: recibe las jornadas,
 * los ajustes y la fecha de referencia, y no toca ni el reloj ni la base de datos.
 * Todas las reglas acordadas viven aquí, y aquí están las únicas que hay: la
 * interfaz y las exportaciones consumen estas funciones en lugar de reimplementarlas.
 *
 * - Los tramos se fusionan antes de sumar: dos tramos solapados cuentan una vez.
 * - Regla única de redondeo: cada intervalo fusionado se redondea al minuto y se suman.
 * - Un tramo abierto de un día anterior es un olvido y no computa.
 * - El extra es semanal: solo lo que supere el objetivo de esa semana.
 * - El objetivo semanal sale de `horasSemana`, repartido entre los días laborables
 *   configurados y prorrateado a los días que de verdad computan.
 * - El aviso usa un margen de tolerancia, pero el saldo es exacto.
 */

import { diaSemanaISO, fechasDeSemana, lunesDe, sumarDias } from './fechas';
import type { Ajustes, Estado, Jornada, ResumenSemana, Tramo, TipoDia } from './tipos';

const MS_POR_MINUTO = 60_000;

/** Situación actual del fichaje, derivada del último tramo del día. */
export type Situacion = 'fuera' | 'trabajando' | 'en-pausa';

/** Tramo abierto que pertenece a un día anterior: es un olvido, no tiempo trabajado. */
export function esOlvido(jornada: Jornada, tramo: Tramo, hoy: string): boolean {
  return tramo.fin === null && jornada.fecha !== hoy;
}

/** Tramos ordenados por hora de inicio. */
export function tramosOrdenados(jornada: Jornada): Tramo[] {
  return [...jornada.tramos].sort((a, b) => a.inicio - b.inicio);
}

/** Tramos que cuentan para el cómputo: todos menos los olvidos. */
export function tramosComputables(jornada: Jornada, hoy: string): Tramo[] {
  return tramosOrdenados(jornada).filter((t) => !esOlvido(jornada, t, hoy));
}

/** Olvidos pendientes de arreglar, del más antiguo al más reciente. */
export function olvidos(jornadas: Jornada[], hoy: string): { jornada: Jornada; tramo: Tramo }[] {
  const pendientes: { jornada: Jornada; tramo: Tramo }[] = [];
  for (const jornada of jornadas) {
    for (const tramo of jornada.tramos) {
      if (esOlvido(jornada, tramo, hoy)) pendientes.push({ jornada, tramo });
    }
  }
  return pendientes.sort((a, b) => a.tramo.inicio - b.tramo.inicio);
}

/** Intervalo de trabajo ya fusionado y saneado. */
export interface Intervalo {
  inicio: number;
  fin: number;
}

/**
 * Intervalos reales de trabajo del día, con los solapes fusionados.
 * El reloj no trabaja dos veces a la vez: si dos tramos se pisan, cuentan una sola vez.
 * Un fin anterior al inicio se trata como duración cero en lugar de restar tiempo.
 */
export function intervalosDe(jornada: Jornada, hoy: string, ahora: number): Intervalo[] {
  const crudos: Intervalo[] = tramosComputables(jornada, hoy)
    .map((tramo) => {
      const fin = tramo.fin ?? ahora;
      return { inicio: tramo.inicio, fin: Math.max(tramo.inicio, fin) };
    })
    .sort((a, b) => a.inicio - b.inicio);

  const fusionados: Intervalo[] = [];
  for (const actual of crudos) {
    const ultimo = fusionados.at(-1);
    if (ultimo !== undefined && actual.inicio <= ultimo.fin) {
      ultimo.fin = Math.max(ultimo.fin, actual.fin);
    } else {
      fusionados.push({ ...actual });
    }
  }
  return fusionados;
}

/** Minutos de un intervalo, redondeados al minuto. */
function minutosDeIntervalo(intervalo: Intervalo): number {
  return Math.max(0, Math.round((intervalo.fin - intervalo.inicio) / MS_POR_MINUTO));
}

/**
 * Minutos trabajados en una jornada.
 *
 * Regla única de redondeo: cada intervalo fusionado se redondea al minuto y se
 * suman. La interfaz, el PDF y el CSV usan esta misma cifra, así que no pueden
 * discrepar entre sí.
 */
export function minutosJornada(jornada: Jornada, hoy: string, ahora: number): number {
  return intervalosDe(jornada, hoy, ahora).reduce(
    (total, intervalo) => total + minutosDeIntervalo(intervalo),
    0,
  );
}

/**
 * Duración de un tramo suelto en minutos, para pintarlo en una lista.
 * Es la misma cuenta que la del cómputo, pero de un solo tramo.
 */
export function minutosTramo(tramo: Tramo, ahora: number): number {
  const fin = tramo.fin ?? ahora;
  return Math.max(0, Math.round((Math.max(tramo.inicio, fin) - tramo.inicio) / MS_POR_MINUTO));
}

/** Minutos objetivo de un día concreto, según su tipo y los días laborables configurados. */
export function minutosObjetivoDia(ajustes: Ajustes, fecha: string, tipo: TipoDia): number {
  if (tipo !== 'laborable') return 0;
  if (!ajustes.diasLaborables.includes(diaSemanaISO(fecha))) return 0;
  return Math.round(ajustes.horasDia * 60);
}

/**
 * Minutos objetivo de una semana.
 *
 * El límite semanal configurable se reparte entre los días laborables y se
 * prorratea a los días que de verdad computan, así que un festivo lo baja solo.
 * Con 40 h y 5 días laborables, una semana con un festivo da 32 h.
 */
export function minutosObjetivoSemana(ajustes: Ajustes, diasComputables: number): number {
  const totalDias = ajustes.diasLaborables.length;
  if (totalDias === 0 || diasComputables <= 0) return 0;
  return Math.round((ajustes.horasSemana * 60 * diasComputables) / totalDias);
}

/**
 * Objetivos ya congelados de semanas cerradas, indexados por su lunes.
 * Se congelan al cerrarse para que cambiar el límite semanal no reescriba hacia
 * atrás el saldo: el saldo es constancia, y una constancia que cambia sola no vale.
 */
export type ObjetivosCongelados = Record<string, number>;

/** Semáforo a partir de una cifra y su objetivo, respetando el margen de aviso. */
export function estadoDeCifra(minutos: number, objetivo: number, margen: number): Estado {
  const exceso = minutos - objetivo;
  if (exceso > margen) return 'excedido';
  if (exceso > 0) return 'aviso';
  return 'bien';
}

/** Situación de fichaje actual. */
export function situacionActual(jornada: Jornada | undefined): Situacion {
  if (!jornada || jornada.tramos.length === 0) return 'fuera';
  const ultimo = tramosOrdenados(jornada).at(-1);
  if (ultimo === undefined) return 'fuera';
  return ultimo.fin === null ? 'trabajando' : 'en-pausa';
}

/** Resumen de un día concreto. */
export interface ResumenDia {
  fecha: string;
  minutos: number;
  objetivo: number;
}

export function resumenDia(
  jornada: Jornada | undefined,
  ajustes: Ajustes,
  hoy: string,
  ahora: number,
): ResumenDia {
  const fecha = jornada?.fecha ?? hoy;
  const tipo = jornada?.tipo ?? 'laborable';
  return {
    fecha,
    minutos: jornada ? minutosJornada(jornada, hoy, ahora) : 0,
    objetivo: minutosObjetivoDia(ajustes, fecha, tipo),
  };
}

/** Índice fecha -> jornada, para no reconstruirlo en cada semana. */
function indiceDe(jornadas: Jornada[]): Map<string, Jornada> {
  return new Map(jornadas.map((j) => [j.fecha, j]));
}

/**
 * Resumen de la semana que empieza en `lunes`, usando un índice ya construido.
 * `objetivoCongelado` se usa para las semanas cerradas cuyo objetivo ya se fijó.
 */
function resumenSemanaConIndice(
  indice: Map<string, Jornada>,
  ajustes: Ajustes,
  lunes: string,
  hoy: string,
  ahora: number,
  objetivoCongelado?: number,
): ResumenSemana {
  const fechas = fechasDeSemana(lunes);

  let minutosTrabajados = 0;
  let diasComputables = 0;

  for (const fecha of fechas) {
    const jornada = indice.get(fecha);
    if (jornada) minutosTrabajados += minutosJornada(jornada, hoy, ahora);
    if (minutosObjetivoDia(ajustes, fecha, jornada?.tipo ?? 'laborable') > 0) {
      diasComputables += 1;
    }
  }

  const minutosObjetivo = objetivoCongelado ?? minutosObjetivoSemana(ajustes, diasComputables);

  return {
    lunes,
    fechas,
    minutosTrabajados,
    minutosObjetivo,
    minutosExtra: Math.max(0, minutosTrabajados - minutosObjetivo),
    diasComputables,
    cerrada: sumarDias(lunes, 6) < hoy,
    estado: estadoDeCifra(minutosTrabajados, minutosObjetivo, ajustes.margenAvisoMin),
  };
}

/** Resumen de la semana natural que contiene `fechaRef`. */
export function resumenSemana(
  jornadas: Jornada[],
  ajustes: Ajustes,
  fechaRef: string,
  hoy: string,
  ahora: number,
  objetivoCongelado?: number,
): ResumenSemana {
  return resumenSemanaConIndice(
    indiceDe(jornadas),
    ajustes,
    lunesDe(fechaRef),
    hoy,
    ahora,
    objetivoCongelado,
  );
}

/**
 * Semanas ya cerradas cuyo objetivo todavía no se ha congelado.
 * El estado las congela al arrancar, y así el saldo deja de depender de los
 * ajustes actuales.
 */
export function semanasSinCongelar(
  jornadas: Jornada[],
  ajustes: Ajustes,
  hoy: string,
  ahora: number,
  objetivos: ObjetivosCongelados,
): ObjetivosCongelados {
  if (jornadas.length === 0) return {};

  const primeraFecha = jornadas
    .map((j) => j.fecha)
    .sort()
    .at(0);
  if (primeraFecha === undefined) return {};

  const indice = indiceDe(jornadas);
  const lunesActual = lunesDe(hoy);
  const pendientes: ObjetivosCongelados = {};
  let cursor = lunesDe(primeraFecha);

  for (let i = 0; cursor <= lunesActual && i < 10_400; i += 1) {
    const resumen = resumenSemanaConIndice(indice, ajustes, cursor, hoy, ahora);
    if (resumen.cerrada && objetivos[cursor] === undefined) {
      pendientes[cursor] = resumen.minutosObjetivo;
    }
    cursor = sumarDias(cursor, 7);
  }

  return pendientes;
}

/** Saldo acumulado de extras. */
export interface SaldoExtras {
  /** Extras de semanas ya cerradas. Es el saldo firme. */
  minutos: number;
  /** Extra de la semana en curso, todavía provisional porque la semana no ha cerrado. */
  provisional: number;
  /** Cuántas semanas cerradas se han tenido en cuenta. */
  semanas: number;
}

/**
 * Saldo de extras acumulado.
 *
 * Solo las semanas cerradas suman al saldo firme: mientras la semana está en
 * curso, lo de más todavía puede compensarse trabajando menos.
 */
export function saldoExtras(
  jornadas: Jornada[],
  ajustes: Ajustes,
  hoy: string,
  ahora: number,
  objetivos: ObjetivosCongelados = {},
): SaldoExtras {
  if (jornadas.length === 0) return { minutos: 0, provisional: 0, semanas: 0 };

  const primeraFecha = jornadas
    .map((j) => j.fecha)
    .sort()
    .at(0);
  if (primeraFecha === undefined) return { minutos: 0, provisional: 0, semanas: 0 };

  const indice = indiceDe(jornadas);
  const lunesActual = lunesDe(hoy);
  let cursor = lunesDe(primeraFecha);
  let minutos = 0;
  let provisional = 0;
  let semanas = 0;

  // Guarda de seguridad: nunca más de 200 años de semanas.
  for (let i = 0; cursor <= lunesActual && i < 10_400; i += 1) {
    // Las semanas cerradas usan su objetivo congelado, si lo tienen.
    const resumen = resumenSemanaConIndice(indice, ajustes, cursor, hoy, ahora, objetivos[cursor]);
    if (resumen.cerrada) {
      minutos += resumen.minutosExtra;
      semanas += 1;
    } else {
      provisional = resumen.minutosExtra;
    }
    cursor = sumarDias(cursor, 7);
  }

  return { minutos, provisional, semanas };
}
