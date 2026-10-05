/**
 * Tests del estado de la aplicación.
 *
 * La nube se sustituye por un almacén en memoria, así que lo que se prueba es
 * la lógica propia: la cola de escritura, el candado de reentrada, que memoria
 * y nube no se desincronicen, y que un fallo de red se note en vez de fingir
 * que se ha guardado.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AJUSTES_POR_DEFECTO, type Ajustes, type Jornada } from './tipos';

const nube = vi.hoisted(() => ({
  jornadas: new Map<string, Jornada>(),
  ids: new Map<string, string>(),
  ajustes: null as unknown,
  fallar: false,
  codigo: 0,
}));

vi.mock('./nube', () => ({
  descargarJornadas: vi.fn(async () => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    return {
      jornadas: [...nube.jornadas.values()],
      descartados: 0,
      idsPorFecha: new Map(nube.ids),
    };
  }),
  descargarAjustes: vi.fn(async () => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    return nube.ajustes === null
      ? null
      : { ajustes: nube.ajustes, objetivosSemanas: {}, idDocumento: 'ajustes-1' };
  }),
  crearJornada: vi.fn(async (jornada: Jornada) => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    const id = `id-${jornada.fecha}`;
    nube.jornadas.set(jornada.fecha, jornada);
    nube.ids.set(jornada.fecha, id);
    return id;
  }),
  actualizarJornada: vi.fn(async (_id: string, jornada: Jornada) => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    nube.jornadas.set(jornada.fecha, jornada);
  }),
  borrarJornada: vi.fn(async (id: string) => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    for (const [fecha, guardado] of nube.ids) {
      if (guardado === id) {
        nube.ids.delete(fecha);
        nube.jornadas.delete(fecha);
      }
    }
  }),
  guardarAjustes: vi.fn(async (ajustes: Ajustes) => {
    if (nube.fallar) throw Object.assign(new Error('sin red'), { code: nube.codigo });
    nube.ajustes = ajustes;
    return 'ajustes-1';
  }),
}));

vi.mock('./sesion.svelte', () => ({
  sesion: {
    usuario: { id: 'usuario-1', nombre: 'Prueba', email: 'prueba@ejemplo.com' },
    error: null as string | null,
    salir: vi.fn(async () => {}),
  },
}));

import { app } from './estado.svelte';
import { sesion } from './sesion.svelte';
import { lunesDe, sumarDias } from './fechas';
import { instanteLocal } from './parseo';

function jornadaDe(fecha: string, minutos: number): Jornada {
  const inicio = instanteLocal(fecha, '09:00');
  if (inicio === null) throw new Error('fecha inválida en el test');
  return {
    fecha,
    tipo: 'laborable',
    tramos: [{ id: `${fecha}-0`, inicio, fin: inicio + minutos * 60_000 }],
  };
}

function limpiar(): void {
  nube.jornadas.clear();
  nube.ids.clear();
  nube.ajustes = null;
  nube.fallar = false;
  app.olvidar();
}

describe('carga desde la nube', () => {
  beforeEach(limpiar);

  it('trae el historial y lo deja en memoria', async () => {
    nube.jornadas.set('2026-09-30', jornadaDe('2026-09-30', 480));
    nube.ids.set('2026-09-30', 'id-2026-09-30');

    await app.cargar();

    expect(app.jornadas).toHaveLength(1);
    expect(app.jornadas[0]!.fecha).toBe('2026-09-30');
    expect(app.cargado).toBe(true);
    expect(app.error).toBeNull();
  });

  it('si la nube no responde, lo dice y no finge tener datos', async () => {
    nube.fallar = true;
    await app.cargar();

    expect(app.jornadas).toHaveLength(0);
    // No se da por cargada: así la app no muestra un historial vacío que
    // parecería "no tengo nada fichado" cuando en realidad no ha podido mirar.
    expect(app.cargado).toBe(false);
    expect(app.error).toMatch(/no se ha podido descargar/i);
  });

  it('si la sesión ha caducado, pide volver a entrar en vez de hablar de conexión', async () => {
    nube.fallar = true;
    nube.codigo = 401;

    await app.cargar();

    // Ni se habla de conexión ni se pinta la app vacía: se cierra la sesión y se
    // pide volver a entrar.
    expect(app.error).toBeNull();
    expect(app.cargado).toBe(false);
    expect(sesion.salir).toHaveBeenCalled();
    expect(sesion.error).toMatch(/caducado/i);
  });

  it('crea unos ajustes por defecto si el usuario todavía no tiene', async () => {
    await app.cargar();
    expect(app.ajustes).toEqual(AJUSTES_POR_DEFECTO);
  });
});

describe('fichaje contra la nube', () => {
  beforeEach(limpiar);

  it('una pulsación abre un tramo y lo escribe en la nube', async () => {
    await app.ficharEntrada();

    expect(app.jornadaHoy?.tramos).toHaveLength(1);
    expect(app.situacion).toBe('trabajando');
    expect(nube.jornadas.get(app.hoy)?.tramos).toHaveLength(1);
  });

  it('dos pulsaciones rápidas no abren dos tramos', async () => {
    await Promise.all([app.ficharEntrada(), app.ficharEntrada()]);
    expect(app.jornadaHoy?.tramos).toHaveLength(1);
    expect(nube.jornadas.get(app.hoy)?.tramos).toHaveLength(1);
  });

  it('una pausa inmediata después de fichar no se pierde', async () => {
    await Promise.all([app.ficharEntrada(), app.cerrarTramo()]);

    const tramos = app.jornadaHoy?.tramos ?? [];
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.fin).not.toBeNull();
    expect(app.situacion).toBe('en-pausa');
  });

  it('cerrar dos veces no deja el tramo a medias', async () => {
    await app.ficharEntrada();
    await Promise.all([app.cerrarTramo(), app.cerrarTramo()]);

    const tramos = app.jornadaHoy?.tramos ?? [];
    expect(tramos).toHaveLength(1);
    expect(tramos[0]!.fin).not.toBeNull();
  });

  it('sin conexión avisa y no aplica el cambio en memoria', async () => {
    nube.fallar = true;
    const resultado = await app.ficharEntrada();

    expect(resultado).toBe(false);
    expect(app.error).toMatch(/no se ha podido guardar/i);
    expect(app.jornadaHoy).toBeUndefined();
  });
});

describe('correcciones', () => {
  beforeEach(limpiar);

  it('guardar sustituye la jornada del mismo día', async () => {
    await app.guardar(jornadaDe('2026-09-30', 480));
    await app.guardar({ ...jornadaDe('2026-09-30', 240), tipo: 'festivo', corregido: true });

    expect(app.jornadas).toHaveLength(1);
    expect(nube.jornadas.get('2026-09-30')?.tipo).toBe('festivo');
    expect(nube.jornadas.size).toBe(1);
  });

  it('eliminar borra en la nube y en memoria', async () => {
    await app.guardar(jornadaDe('2026-09-30', 480));
    await app.eliminar('2026-09-30');

    expect(app.jornadas).toHaveLength(0);
    expect(nube.jornadas.has('2026-09-30')).toBe(false);
  });

  it('si falla guardar los ajustes, se revierten', async () => {
    await app.cargar();
    const antes = app.ajustes.horasSemana;

    nube.fallar = true;
    const resultado = await app.actualizarAjustes({ horasSemana: 12 });

    expect(resultado).toBe(false);
    expect(app.ajustes.horasSemana).toBe(antes);
  });

  it('los ajustes se persisten cuando la nube responde', async () => {
    await app.cargar();
    await app.actualizarAjustes({ horasSemana: 35 });

    expect(app.ajustes.horasSemana).toBe(35);
    expect((nube.ajustes as Ajustes).horasSemana).toBe(35);
  });
});

describe('importación de una copia', () => {
  beforeEach(limpiar);

  it('escribe todas las jornadas y devuelve cuántas', async () => {
    const escritas = await app.importar(
      [jornadaDe('2026-09-29', 480), jornadaDe('2026-09-30', 480)],
      null,
    );

    expect(escritas).toBe(2);
    expect(nube.jornadas.size).toBe(2);
    expect(app.jornadas).toHaveLength(2);
  });

  it('es idempotente: repetirla no duplica nada', async () => {
    const copia = [jornadaDe('2026-09-29', 480)];
    await app.importar(copia, null);
    await app.importar(copia, null);

    expect(nube.jornadas.size).toBe(1);
    expect(app.jornadas).toHaveLength(1);
  });

  it('informa de cuántas se han escrito si se corta a la mitad', async () => {
    let llamadas = 0;
    const { crearJornada } = await import('./nube');
    vi.mocked(crearJornada).mockImplementation(async (jornada: Jornada) => {
      llamadas += 1;
      if (llamadas === 2) throw new Error('sin red');
      const id = `id-${jornada.fecha}`;
      nube.jornadas.set(jornada.fecha, jornada);
      nube.ids.set(jornada.fecha, id);
      return id;
    });

    const escritas = await app.importar(
      [jornadaDe('2026-09-28', 480), jornadaDe('2026-09-29', 480)],
      null,
    );

    expect(escritas).toBe(1);
  });
});

describe('objetivos congelados', () => {
  beforeEach(limpiar);

  it('congela el objetivo de las semanas cerradas al cargar', async () => {
    const lunes = lunesDe(sumarDias(app.hoy, -14));
    for (let dia = 0; dia < 5; dia += 1) {
      const fecha = sumarDias(lunes, dia);
      nube.jornadas.set(fecha, jornadaDe(fecha, 510));
      nube.ids.set(fecha, `id-${fecha}`);
    }

    await app.cargar();

    // Cinco días de 8 h 30 min = 42 h 30 min contra un objetivo de 40 h.
    expect(app.saldo.minutos).toBe(150);
  });
});
