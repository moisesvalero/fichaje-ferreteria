/**
 * Tests del estado de la aplicación.
 *
 * Cubren lo que no se ve en una función pura: el candado de reentrada del botón
 * de fichar y el ciclo completo de guardado contra IndexedDB (en memoria).
 */

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { db } from './db';
import { app } from './estado.svelte';
import { AJUSTES_POR_DEFECTO } from './tipos';

async function limpiar(): Promise<void> {
  await db.jornadas.clear();
  await db.ajustes.clear();
  await db.meta.clear();
  app.jornadas = [];
  app.ajustes = { ...AJUSTES_POR_DEFECTO };
}

describe('fichaje con candado de reentrada', () => {
  beforeEach(limpiar);

  it('una pulsación abre un tramo abierto', async () => {
    await app.ficharEntrada();
    expect(app.jornadaHoy?.tramos).toHaveLength(1);
    expect(app.jornadaHoy?.tramos[0]!.fin).toBeNull();
    expect(app.situacion).toBe('trabajando');
  });

  it('dos pulsaciones rápidas no abren dos tramos', async () => {
    // Regresión: sin candado, el segundo toque leía el estado viejo y
    // o duplicaba el tramo o perdía el primero.
    const primera = app.ficharEntrada();
    const segunda = app.ficharEntrada();
    await Promise.all([primera, segunda]);

    expect(app.jornadaHoy?.tramos).toHaveLength(1);
    expect(app.guardando).toBe(false);
  });

  it('tres pulsaciones rápidas tampoco', async () => {
    await Promise.all([app.ficharEntrada(), app.ficharEntrada(), app.ficharEntrada()]);
    expect(app.jornadaHoy?.tramos).toHaveLength(1);
  });

  it('una pausa inmediata después de fichar no se pierde', async () => {
    // Este es el caso que distingue de verdad: sin serializar, el cierre leía
    // un estado en el que todavía no había tramo, no cerraba nada y el reloj
    // se quedaba corriendo.
    const entrada = app.ficharEntrada();
    const pausa = app.cerrarTramo();
    await Promise.all([entrada, pausa]);

    const tramos = app.jornadaHoy?.tramos ?? [];
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.fin).not.toBeNull();
    expect(app.situacion).toBe('en-pausa');
  });

  it('mientras hay escrituras pendientes la interfaz sabe que debe desactivar los botones', async () => {
    const entrada = app.ficharEntrada();
    expect(app.guardando).toBe(true);
    await entrada;
    expect(app.guardando).toBe(false);
  });

  it('cerrar dos veces no deja el tramo a medias ni abre otro', async () => {
    await app.ficharEntrada();
    await Promise.all([app.cerrarTramo(), app.cerrarTramo()]);

    const tramos = app.jornadaHoy?.tramos ?? [];
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.fin).not.toBeNull();
    expect(app.situacion).toBe('en-pausa');
  });

  it('cerrar sin nada abierto no hace nada', async () => {
    await app.cerrarTramo();
    expect(app.jornadaHoy).toBeUndefined();
    expect(app.error).toBeNull();
  });

  it('el ciclo entrada, pausa y reanudación deja dos tramos cerrados y uno abierto', async () => {
    await app.ficharEntrada();
    await app.cerrarTramo();
    await app.ficharEntrada();
    await app.cerrarTramo();
    await app.ficharEntrada();

    const tramos = app.jornadaHoy?.tramos ?? [];
    expect(tramos).toHaveLength(3);
    expect(tramos.filter((t) => t.fin === null)).toHaveLength(1);
  });

  it('el tramo abierto de un día anterior no computa y aparece como olvido', async () => {
    await app.guardar({
      fecha: '2026-09-27',
      tipo: 'laborable',
      tramos: [{ id: 'x', inicio: new Date(2026, 8, 27, 9, 0).getTime(), fin: null }],
    });

    expect(app.pendientes).toHaveLength(1);
    expect(app.saldo.minutos).toBe(0);
  });
});

describe('ajustes y borrado', () => {
  beforeEach(limpiar);

  it('actualiza un ajuste y lo persiste', async () => {
    await app.actualizarAjustes({ horasSemana: 35 });
    expect(app.ajustes.horasSemana).toBe(35);
    const guardado = await db.ajustes.get(1);
    expect(guardado?.horasSemana).toBe(35);
  });

  it('elimina la jornada de un día', async () => {
    await app.ficharEntrada();
    const fecha = app.hoy;
    await app.eliminar(fecha);
    expect(app.jornadas).toHaveLength(0);
    expect(await db.jornadas.get(fecha)).toBeUndefined();
  });

  it('guardar una corrección marca el registro y sustituye el del mismo día', async () => {
    await app.ficharEntrada();
    const fecha = app.hoy;
    await app.guardar({
      fecha,
      tipo: 'festivo',
      corregido: true,
      tramos: [
        {
          id: 'a',
          inicio: new Date(new Date().setHours(9, 0, 0, 0)).getTime(),
          fin: new Date(new Date().setHours(13, 0, 0, 0)).getTime(),
        },
      ],
    });

    expect(app.jornadas.filter((j) => j.fecha === fecha)).toHaveLength(1);
    expect(app.jornadaHoy?.tipo).toBe('festivo');
    expect(app.jornadaHoy?.corregido).toBe(true);
  });
});

describe('importación de copia', () => {
  beforeEach(limpiar);

  it('restaura las jornadas y los ajustes de una copia validada', async () => {
    await app.importar(
      [
        {
          fecha: '2026-09-30',
          tipo: 'laborable',
          tramos: [
            {
              id: 'a',
              inicio: new Date(2026, 8, 30, 9, 0).getTime(),
              fin: new Date(2026, 8, 30, 13, 0).getTime(),
            },
          ],
        },
      ],
      { ...AJUSTES_POR_DEFECTO, horasSemana: 35 },
    );

    expect(app.jornadas).toHaveLength(1);
    expect(app.ajustes.horasSemana).toBe(35);
    expect(app.error).toBeNull();
  });

  it('mantiene los ajustes actuales cuando la copia no trae unos válidos', async () => {
    await app.importar([], null);
    expect(app.ajustes).toEqual(AJUSTES_POR_DEFECTO);
  });
});
