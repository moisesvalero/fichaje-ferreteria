/**
 * Exportación y copia de seguridad. Funciones puras, sin tocar el DOM.
 *
 * - CSV para abrir en una hoja de cálculo, con los minutos de cada día tomados
 *   del motor para que no puedan discrepar del PDF ni de la app.
 * - Resumen estructurado que la capa de interfaz convierte en PDF.
 * - Copia de seguridad JSON, con validación profunda al leerla: este archivo es
 *   la única garantía real de conservación de los datos, así que no puede ser
 *   una puerta abierta a datos corruptos.
 *
 * Los minutos siempre salen de `calculo.ts`. Aquí no se recalcula nada.
 */

import { minutosJornada, minutosTramo, resumenSemana } from './calculo';
import { aFecha, inicioDelDiaLocal, lunesDe, sumarDias } from './fechas';
import { formatearHora } from './formato';
import { partesDeFecha } from './parseo';
import type { Ajustes, Jornada, Tramo, TipoDia } from './tipos';

export const VERSION_COPIA = 1;

/** Marca de orden de bytes: sin ella Excel en Windows destroza los acentos. */
export const BOM_UTF8 = '\ufeff';

const TIPOS_VALIDOS: readonly TipoDia[] = ['laborable', 'festivo', 'vacaciones', 'baja'];

const ETIQUETA_TIPO: Record<TipoDia, string> = {
  laborable: 'Laborable',
  festivo: 'Festivo',
  vacaciones: 'Vacaciones',
  baja: 'Baja',
};

function esTipoValido(valor: unknown): valor is TipoDia {
  return typeof valor === 'string' && (TIPOS_VALIDOS as readonly string[]).includes(valor);
}

/**
 * Escapa un campo para CSV y neutraliza las fórmulas.
 *
 * Un valor que empieza por `=`, `+`, `-` o `@` se evalúa al abrir el archivo en
 * una hoja de cálculo, así que se le antepone un apóstrofo.
 */
function campoCSV(valor: string, { textoLibre = false } = {}): string {
  let limpio = valor;
  if (textoLibre && /^[=+\-@\t\r]/.test(limpio)) limpio = `'${limpio}`;
  if (/[";\n]/.test(limpio)) return `"${limpio.replace(/"/g, '""')}"`;
  return limpio;
}

/**
 * Minutos de un tramo suelto para la exportación.
 * Aplica la misma regla que el motor: un tramo sin cerrar de un día anterior es
 * un olvido y vale cero, para que la fila no contradiga al total del día.
 */
function minutosDeTramoExport(tramo: Tramo, esHoy: boolean, ahora: number): number {
  if (tramo.fin === null && !esHoy) return 0;
  return minutosTramo(tramo, ahora);
}

/**
 * CSV con una fila por tramo.
 *
 * Se usa punto y coma como separador porque Excel en español lo espera así.
 * La columna «Minutos del día» sale del motor y es la cifra autoritativa: sumar
 * la columna «Minutos» de los tramos puede desviarse un minuto por redondeo.
 */
export function generarCSV(
  jornadas: Jornada[],
  desde: string,
  hasta: string,
  hoy: string,
  ahora: number,
): string {
  const filas: string[] = [
    ['Fecha', 'Tipo', 'Inicio', 'Fin', 'Minutos', 'Minutos del dia', 'Nota'].join(';'),
  ];

  const seleccion = jornadas
    .filter((j) => j.fecha >= desde && j.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  for (const jornada of seleccion) {
    const esHoy = jornada.fecha === hoy;
    const minutosDelDia = String(minutosJornada(jornada, hoy, ahora));
    const tramos = [...jornada.tramos].sort((a, b) => a.inicio - b.inicio);
    const nota = campoCSV(jornada.nota ?? '', { textoLibre: true });

    if (tramos.length === 0) {
      filas.push(
        [jornada.fecha, ETIQUETA_TIPO[jornada.tipo], '', '', '0', minutosDelDia, nota]
          .map((v, i) => (i === 6 ? v : campoCSV(v)))
          .join(';'),
      );
      continue;
    }

    for (const tramo of tramos) {
      const sinCerrar = tramo.fin === null;
      const fin = sinCerrar ? (esHoy ? 'en curso' : 'sin cerrar') : formatearHora(tramo.fin!);
      const minutos = String(minutosDeTramoExport(tramo, esHoy, ahora));
      filas.push(
        [
          jornada.fecha,
          ETIQUETA_TIPO[jornada.tipo],
          formatearHora(tramo.inicio),
          fin,
          minutos,
          minutosDelDia,
          nota,
        ]
          .map((v, i) => (i === 6 ? v : campoCSV(v)))
          .join(';'),
      );
    }
  }

  return `${BOM_UTF8}${filas.join('\n')}\n`;
}

/** Una semana dentro del rango exportado. */
export interface SemanaExport {
  lunes: string;
  etiqueta: string;
  minutos: number;
  extra: number;
  cerrada: boolean;
}

/** Datos ya calculados que necesita el resumen en PDF. */
export interface ResumenExport {
  desde: string;
  hasta: string;
  minutosTotales: number;
  minutosExtra: number;
  diasTrabajados: number;
  semanas: SemanaExport[];
  dias: { fecha: string; tipo: TipoDia; minutos: number }[];
}

/** Resumen de un rango de fechas para el PDF personal. */
export function generarResumen(
  jornadas: Jornada[],
  ajustes: Ajustes,
  desde: string,
  hasta: string,
  hoy: string,
  ahora: number,
): ResumenExport {
  const seleccion = jornadas
    .filter((j) => j.fecha >= desde && j.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const dias = seleccion.map((j) => ({
    fecha: j.fecha,
    tipo: j.tipo,
    minutos: minutosJornada(j, hoy, ahora),
  }));

  const minutosTotales = dias.reduce((total, d) => total + d.minutos, 0);
  const diasTrabajados = dias.filter((d) => d.minutos > 0).length;

  // Se recorren las semanas desde el lunes del primer día hasta el del último.
  const semanas: SemanaExport[] = [];
  const primero = seleccion.at(0);
  const ultimo = seleccion.at(-1);

  if (primero !== undefined && ultimo !== undefined) {
    const ultimoLunes = lunesDe(ultimo.fecha);
    let cursor = lunesDe(primero.fecha);

    for (let i = 0; cursor <= ultimoLunes && i < 520; i += 1) {
      const resumen = resumenSemana(jornadas, ajustes, cursor, hoy, ahora);
      semanas.push({
        lunes: cursor,
        etiqueta: `${cursor} · ${sumarDias(cursor, 6)}`,
        minutos: resumen.minutosTrabajados,
        extra: resumen.minutosExtra,
        cerrada: resumen.cerrada,
      });
      cursor = sumarDias(cursor, 7);
    }
  }

  return {
    desde,
    hasta,
    minutosTotales,
    // El extra es semanal: solo cuenta el de las semanas ya cerradas dentro del rango.
    minutosExtra: semanas.filter((s) => s.cerrada).reduce((total, s) => total + s.extra, 0),
    diasTrabajados,
    semanas,
    dias,
  };
}

/* ------------------------------------------------------------------ */
/* Validación de la copia de seguridad                                 */
/* ------------------------------------------------------------------ */

/** Contenido de la copia de seguridad completa. */
export interface CopiaSeguridad {
  version: number;
  exportado: string;
  ajustes: Ajustes;
  jornadas: Jornada[];
}

/** Resultado de leer una copia: o viene bien, o explica por qué no. */
export type LecturaCopia = { ok: true; copia: CopiaLeida } | { ok: false; error: string };

export interface CopiaLeida {
  jornadas: Jornada[];
  /** Ajustes validados, o null si la copia no traía unos utilizables. */
  ajustes: Ajustes | null;
  /** Jornadas descartadas por estar mal formadas. */
  descartadas: number;
  /** Jornadas repetidas por fecha; se conserva la última. */
  duplicadas: number;
  /** Tramos cuyo identificador venía repetido y se ha renombrado. */
  idsRenombrados: number;
  /** Cosas que el usuario debería saber, sin llegar a impedir la restauración. */
  avisos: string[];
}

function esNumeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/** Un día no puede tener más de 24 horas de trabajo, por definición. */
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Sanea un tramo.
 *
 * Además de comprobar que los instantes son números, exige que **caigan dentro
 * del día de su jornada** y que no duren más de 24 horas. Sin esa cota, un
 * `inicio: 0` de 1970 entraba sin una queja y contaminaba el saldo para siempre.
 *
 * Los ids repetidos se renombran: Svelte lanza al renderizar una lista con
 * claves duplicadas, y eso dejaría la app sin arrancar y sin forma de arreglarlo
 * desde dentro.
 */
function sanearTramo(
  valor: unknown,
  fecha: string,
  indice: number,
  idsVistos: Set<string>,
): { tramo: Tramo | null; idRenombrado: boolean } {
  if (typeof valor !== 'object' || valor === null) return { tramo: null, idRenombrado: false };
  const posible = valor as Partial<Tramo>;

  if (!esNumeroFinito(posible.inicio)) return { tramo: null, idRenombrado: false };
  if (posible.fin !== null && !esNumeroFinito(posible.fin)) {
    return { tramo: null, idRenombrado: false };
  }

  // El tramo tiene que empezar dentro del día al que pertenece la jornada.
  const comienzoDelDia = inicioDelDiaLocal(fecha);
  if (posible.inicio < comienzoDelDia || posible.inicio >= comienzoDelDia + MS_POR_DIA) {
    return { tramo: null, idRenombrado: false };
  }

  if (posible.fin !== null) {
    if (posible.fin < posible.inicio) return { tramo: null, idRenombrado: false };
    if (posible.fin - posible.inicio > MS_POR_DIA) return { tramo: null, idRenombrado: false };
  }

  const idBruto =
    typeof posible.id === 'string' && posible.id !== '' ? posible.id : `${fecha}-${indice}`;
  const idRenombrado = idsVistos.has(idBruto);
  const id = idRenombrado ? `${fecha}-${indice}` : idBruto;
  idsVistos.add(id);

  return { tramo: { id, inicio: posible.inicio, fin: posible.fin ?? null }, idRenombrado };
}

export interface JornadaSanedada {
  jornada: Jornada;
  tramosDescartados: number;
  idsRenombrados: number;
}

/**
 * Sanea una jornada venida de fuera (copia de seguridad o base de datos).
 * Devuelve null si no hay nada aprovechable.
 *
 * Es la única puerta de validación de jornadas: se usa al importar y también al
 * cargar, para que un registro corrupto de una versión anterior no rompa la app.
 */
export function sanearJornada(valor: unknown): JornadaSanedada | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const posible = valor as Partial<Jornada>;

  // La fecha tiene que existir de verdad, no solo tener el formato correcto.
  if (typeof posible.fecha !== 'string' || partesDeFecha(posible.fecha) === null) return null;

  const bruto = Array.isArray(posible.tramos) ? posible.tramos : [];
  const idsVistos = new Set<string>();
  const tramos: Tramo[] = [];
  let idsRenombrados = 0;

  bruto.forEach((tramo, i) => {
    const saneado = sanearTramo(tramo, posible.fecha!, i, idsVistos);
    if (saneado.tramo === null) return;
    if (saneado.idRenombrado) idsRenombrados += 1;
    tramos.push(saneado.tramo);
  });

  return {
    jornada: {
      fecha: posible.fecha,
      tipo: esTipoValido(posible.tipo) ? posible.tipo : 'laborable',
      tramos: tramos.sort((a, b) => a.inicio - b.inicio),
      nota:
        typeof posible.nota === 'string' && posible.nota !== ''
          ? posible.nota.slice(0, 500)
          : undefined,
      corregido: posible.corregido === true ? true : undefined,
    },
    tramosDescartados: bruto.length - tramos.length,
    idsRenombrados,
  };
}

/**
 * Valida unos ajustes campo a campo.
 * Devuelve null si algo no encaja: es preferible conservar los del usuario que
 * aplicar una configuración a medias que desactive el objetivo o el aviso.
 */
export function validarAjustes(valor: unknown): Ajustes | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const posible = valor as Partial<Ajustes>;

  const enRango = (v: unknown, min: number, max: number): v is number =>
    esNumeroFinito(v) && v >= min && v <= max;

  if (!enRango(posible.horasDia, 1, 24)) return null;
  if (!enRango(posible.horasSemana, 1, 168)) return null;
  if (!enRango(posible.margenAvisoMin, 0, 120)) return null;
  if (!enRango(posible.recordatorioCopiaDias, 1, 365)) return null;

  if (!Array.isArray(posible.diasLaborables) || posible.diasLaborables.length === 0) return null;
  const dias = [...new Set(posible.diasLaborables)];
  if (!dias.every((d) => esNumeroFinito(d) && Number.isInteger(d) && d >= 1 && d <= 7)) return null;

  return {
    horasDia: posible.horasDia,
    horasSemana: posible.horasSemana,
    margenAvisoMin: Math.round(posible.margenAvisoMin),
    diasLaborables: dias.sort((a, b) => a - b),
    recordatorioCopiaDias: Math.round(posible.recordatorioCopiaDias),
  };
}

/**
 * Lee y valida una copia de seguridad.
 *
 * No lanza nunca: o devuelve una copia saneada, o un error que se puede enseñar.
 */
export function leerCopia(texto: string): LecturaCopia {
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'El archivo no es JSON válido.' };
  }

  if (typeof datos !== 'object' || datos === null) {
    return { ok: false, error: 'El archivo no tiene el formato de una copia de Fichaje.' };
  }

  const bruto = datos as Partial<CopiaSeguridad>;
  if (!Array.isArray(bruto.jornadas)) {
    return { ok: false, error: 'La copia no contiene una lista de jornadas.' };
  }

  const porFecha = new Map<string, Jornada>();
  const avisos: string[] = [];
  let descartadas = 0;
  let duplicadas = 0;
  let tramosDescartados = 0;
  let idsRenombrados = 0;

  for (const item of bruto.jornadas) {
    const normalizada = sanearJornada(item);
    if (normalizada === null) {
      descartadas += 1;
      continue;
    }
    tramosDescartados += normalizada.tramosDescartados;
    idsRenombrados += normalizada.idsRenombrados;
    if (porFecha.has(normalizada.jornada.fecha)) duplicadas += 1;
    porFecha.set(normalizada.jornada.fecha, normalizada.jornada);
  }

  let ajustes: Ajustes | null = null;
  if (bruto.ajustes !== undefined) {
    ajustes = validarAjustes(bruto.ajustes);
    if (ajustes === null) {
      avisos.push('La copia traía unos ajustes que no son válidos: se conservan los tuyos.');
    }
  }

  if (descartadas > 0) {
    avisos.push(
      `${descartadas} ${descartadas === 1 ? 'jornada descartada' : 'jornadas descartadas'} por estar mal formadas.`,
    );
  }
  if (tramosDescartados > 0) {
    avisos.push(
      `${tramosDescartados} ${tramosDescartados === 1 ? 'tramo descartado' : 'tramos descartados'} por tener horas imposibles.`,
    );
  }
  if (duplicadas > 0) {
    avisos.push(
      `${duplicadas} ${duplicadas === 1 ? 'jornada repetida' : 'jornadas repetidas'}: se ha conservado la última.`,
    );
  }
  if (idsRenombrados > 0) {
    avisos.push(
      `${idsRenombrados} ${idsRenombrados === 1 ? 'tramo tenía el identificador repetido' : 'tramos tenían el identificador repetido'} y se ha renombrado.`,
    );
  }

  const jornadas = [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (jornadas.length === 0 && bruto.jornadas.length > 0) {
    return { ok: false, error: 'Ninguna jornada de la copia tiene una fecha válida.' };
  }

  return {
    ok: true,
    copia: { jornadas, ajustes, descartadas, duplicadas, idsRenombrados, avisos },
  };
}

export function generarCopia(jornadas: Jornada[], ajustes: Ajustes, ahora: number): string {
  const copia: CopiaSeguridad = {
    version: VERSION_COPIA,
    exportado: new Date(ahora).toISOString(),
    ajustes,
    jornadas,
  };
  return JSON.stringify(copia, null, 2);
}

/** Nombre de archivo con la fecha, para que no se pisen entre sí. */
export function nombreArchivo(prefijo: string, extension: string, hoy: string): string {
  return `${prefijo}-${hoy}.${extension}`;
}

/** Rango del mes natural al que pertenece la fecha, con desplazamiento en meses. */
export function rangoMes(fecha: string, desplazamiento = 0): { desde: string; hasta: string } {
  const partes = partesDeFecha(fecha);
  if (partes === null) throw new Error(`Fecha inválida: ${fecha}`);

  const inicio = new Date(partes.anio, partes.mes - 1 + desplazamiento, 1, 12);
  const fin = new Date(partes.anio, partes.mes + desplazamiento, 1, 12);
  fin.setDate(fin.getDate() - 1);

  return { desde: aFecha(inicio), hasta: aFecha(fin) };
}
