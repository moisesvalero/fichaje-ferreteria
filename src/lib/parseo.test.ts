import { describe, expect, it } from 'vitest';

import { formatearHora } from './formato';
import { instanteLocal, partesDeFecha, partesDeHora } from './parseo';

describe('partesDeFecha', () => {
  it('descompone una fecha correcta', () => {
    expect(partesDeFecha('2026-09-28')).toEqual({ anio: 2026, mes: 9, dia: 28 });
  });

  it('rechaza formatos que no son YYYY-MM-DD', () => {
    expect(partesDeFecha('28/09/2026')).toBeNull();
    expect(partesDeFecha('2026-9-8')).toBeNull();
    expect(partesDeFecha('')).toBeNull();
  });

  it('rechaza días que no existen', () => {
    expect(partesDeFecha('2026-02-31')).toBeNull();
    expect(partesDeFecha('2026-13-01')).toBeNull();
    expect(partesDeFecha('2026-00-10')).toBeNull();
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(partesDeFecha('2028-02-29')).toEqual({ anio: 2028, mes: 2, dia: 29 });
    expect(partesDeFecha('2026-02-29')).toBeNull();
  });
});

describe('partesDeHora', () => {
  it('descompone horas con y sin segundos', () => {
    expect(partesDeHora('09:05')).toEqual({ hora: 9, minuto: 5, segundo: 0 });
    expect(partesDeHora('09:05:30')).toEqual({ hora: 9, minuto: 5, segundo: 30 });
    expect(partesDeHora('9:05')).toEqual({ hora: 9, minuto: 5, segundo: 0 });
  });

  it('rechaza horas imposibles', () => {
    expect(partesDeHora('25:00')).toBeNull();
    expect(partesDeHora('09:75')).toBeNull();
    expect(partesDeHora('nueve')).toBeNull();
    expect(partesDeHora('')).toBeNull();
  });
});

describe('instanteLocal', () => {
  it('construye el instante y se puede volver a formatear', () => {
    const instante = instanteLocal('2026-09-28', '09:05');
    expect(instante).not.toBeNull();
    expect(formatearHora(instante!)).toBe('09:05');
  });

  it('devuelve null si alguna parte no es válida', () => {
    expect(instanteLocal('2026-02-31', '09:00')).toBeNull();
    expect(instanteLocal('2026-09-28', '99:00')).toBeNull();
  });

  it('mantiene la hora local en la semana del cambio de horario', () => {
    // El horario de verano cambia el domingo 29 de marzo de 2026.
    for (const fecha of ['2026-03-28', '2026-03-29', '2026-03-30']) {
      const instante = instanteLocal(fecha, '09:00');
      expect(formatearHora(instante!)).toBe('09:00');
    }
  });
});
