/** Formateo de cifras y fechas en español. Las horas siempre en formato 24 h. */

import { aMediodiaLocal } from './fechas';

const fmtHora = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fmtFechaCorta = new Intl.DateTimeFormat('es-ES', {
  weekday: 'short',
  day: 'numeric',
});

const fmtFechaLarga = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const fmtDiaMes = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** "09:02" a partir de un timestamp. */
export function formatearHora(ts: number): string {
  return fmtHora.format(new Date(ts));
}

/** "8h 05m". Los minutos siempre a dos dígitos para que la cifra no baile. */
export function formatearMinutos(minutos: number): string {
  const signo = minutos < 0 ? '−' : '';
  const abs = Math.abs(Math.round(minutos));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${signo}${h}h ${String(m).padStart(2, '0')}m`;
}

/** "+6h 45m" para saldos. Sin signo cuando es cero. */
export function formatearSaldo(minutos: number): string {
  const redondeado = Math.round(minutos);
  if (redondeado === 0) return '0h 00m';
  return redondeado > 0 ? `+${formatearMinutos(redondeado)}` : formatearMinutos(redondeado);
}

/** "lun 30" para listas compactas. */
export function formatearFechaCorta(fecha: string): string {
  return fmtFechaCorta.format(aMediodiaLocal(fecha));
}

/** "lunes, 30 de septiembre". */
export function formatearFechaLarga(fecha: string): string {
  return fmtFechaLarga.format(aMediodiaLocal(fecha));
}

/** "30 sep". Uso interno para componer el rango de una semana. */
function formatearDiaMes(fecha: string): string {
  return fmtDiaMes.format(aMediodiaLocal(fecha));
}

/** "30 sep – 6 oct" para el rango de una semana. */
export function formatearRangoSemana(lunes: string, domingo: string): string {
  return `${formatearDiaMes(lunes)} – ${formatearDiaMes(domingo)}`;
}

/** Primera letra en mayúscula, para encabezados. */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
