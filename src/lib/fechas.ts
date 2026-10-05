/**
 * Utilidades de fecha en horario local.
 *
 * Todas las fechas de día se representan como 'YYYY-MM-DD', que además ordena
 * alfabéticamente igual que cronológicamente. La aritmética se hace a mediodía
 * para que los cambios de horario de verano no desplacen el día.
 */

import { partesDeFecha } from './parseo';

/** Convierte un Date a 'YYYY-MM-DD' en horario local. */
export function aFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/**
 * Devuelve el Date de ese día a las 12:00 locales (inmune a los saltos de horario).
 * Lanza si la fecha no está bien formada: es un fallo de programación, no un caso a tolerar.
 */
export function aMediodiaLocal(fecha: string): Date {
  const partes = partesDeFecha(fecha);
  if (partes === null) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(partes.anio, partes.mes - 1, partes.dia, 12, 0, 0, 0);
}

/** Suma (o resta) días a una fecha. */
export function sumarDias(fecha: string, dias: number): string {
  const d = aMediodiaLocal(fecha);
  d.setDate(d.getDate() + dias);
  return aFecha(d);
}

/** Día de la semana en numeración ISO: 1 = lunes ... 7 = domingo. */
export function diaSemanaISO(fecha: string): number {
  const dow = aMediodiaLocal(fecha).getDay();
  return dow === 0 ? 7 : dow;
}

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -(diaSemanaISO(fecha) - 1));
}

/** Las siete fechas de la semana, de lunes a domingo. */
export function fechasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** Diferencia en días entre dos fechas. */
export function diasEntre(desde: string, hasta: string): number {
  const ms = aMediodiaLocal(hasta).getTime() - aMediodiaLocal(desde).getTime();
  return Math.round(ms / 86_400_000);
}
