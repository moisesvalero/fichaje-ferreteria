/**
 * Parseo validado de fechas y horas.
 *
 * Existe porque desestructurar `split()` a ciegas produce `undefined` y acaba en
 * fechas inválidas silenciosas. Aquí, o devuelve números correctos, o `null`.
 */

export interface PartesFecha {
  anio: number;
  mes: number;
  dia: number;
}

export interface PartesHora {
  hora: number;
  minuto: number;
  segundo: number;
}

/** Descompone 'YYYY-MM-DD'. Devuelve null si no encaja o el día no existe. */
export function partesDeFecha(fecha: string): PartesFecha | null {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!coincide) return null;

  const anio = Number(coincide[1]);
  const mes = Number(coincide[2]);
  const dia = Number(coincide[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // Rechaza fechas como el 31 de febrero.
  const comprobacion = new Date(anio, mes - 1, dia, 12);
  if (
    comprobacion.getFullYear() !== anio ||
    comprobacion.getMonth() !== mes - 1 ||
    comprobacion.getDate() !== dia
  ) {
    return null;
  }

  return { anio, mes, dia };
}

/** Descompone 'HH:MM' o 'HH:MM:SS'. Devuelve null si no encaja. */
export function partesDeHora(hora: string): PartesHora | null {
  const coincide = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(hora);
  if (!coincide) return null;

  const partes: PartesHora = {
    hora: Number(coincide[1]),
    minuto: Number(coincide[2]),
    segundo: coincide[3] === undefined ? 0 : Number(coincide[3]),
  };

  if (partes.hora > 23 || partes.minuto > 59 || partes.segundo > 59) return null;
  return partes;
}

/** Instante local a partir de una fecha y una hora. Null si alguna no es válida. */
export function instanteLocal(fecha: string, hora: string): number | null {
  const dia = partesDeFecha(fecha);
  const reloj = partesDeHora(hora);
  if (dia === null || reloj === null) return null;
  return new Date(
    dia.anio,
    dia.mes - 1,
    dia.dia,
    reloj.hora,
    reloj.minuto,
    reloj.segundo,
    0,
  ).getTime();
}
