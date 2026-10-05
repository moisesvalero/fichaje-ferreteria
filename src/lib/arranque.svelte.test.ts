/**
 * El arranque descarga una sola vez.
 *
 * Una auditoría externa afirmó que el `$effect` de `src/App.svelte` entra en
 * bucle infinito porque `cargar()` escribiría el mismo estado que el efecto lee.
 * El efecto real es:
 *
 *   $effect(() => {
 *     if (sesion.usuario === null) { app.olvidar(); return; }
 *     void app.cargar();
 *   });
 *
 * Su única lectura reactiva es `sesion.usuario` (`app.cargado` y `app.jornadas`
 * se leen en la plantilla, que es otro efecto). Si `cargar()` no cambia
 * `sesion.usuario`, este efecto no puede reencolarse: eso es lo que se comprueba
 * aquí. En este proyecto los efectos no se ejecutan en los tests (Vitest carga
 * el runtime de servidor de Svelte), así que se verifica la condición de la que
 * depende el bucle, no el bucle en sí.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nube = vi.hoisted(() => ({
  jornadas: [] as unknown[],
  descargas: 0,
  ajustes: null as unknown,
}));

vi.mock('./nube', () => ({
  descargarJornadas: vi.fn(async () => {
    nube.descargas += 1;
    return { jornadas: nube.jornadas, idsPorFecha: new Map(), descartados: 0 };
  }),
  descargarAjustes: vi.fn(async () => nube.ajustes),
  crearJornada: vi.fn(async () => 'doc-1'),
  actualizarJornada: vi.fn(async () => true),
  borrarJornada: vi.fn(async () => true),
  guardarAjustes: vi.fn(async () => 'ajustes-1'),
}));

vi.mock('./sesion.svelte', () => ({
  sesion: {
    usuario: null as { id: string; nombre: string; email: string } | null,
    error: null as string | null,
    salir: vi.fn(async () => {}),
  },
}));

import { app } from './estado.svelte';
import { sesion } from './sesion.svelte';

beforeEach(() => {
  nube.jornadas = [];
  nube.descargas = 0;
  nube.ajustes = null;
  sesion.usuario = null;
  app.olvidar();
});

describe('arranque', () => {
  it('cargar() no cambia sesion.usuario, que es la única dependencia del efecto', async () => {
    sesion.usuario = { id: 'usuario-1', nombre: 'Prueba', email: 'prueba@ejemplo.com' };
    const antes = sesion.usuario;

    await app.cargar();

    expect(sesion.usuario).toBe(antes);
    expect(sesion.usuario?.id).toBe('usuario-1');
  });

  it('dos cargas seguidas no se multiplican ni se pisan', async () => {
    sesion.usuario = { id: 'usuario-1', nombre: 'Prueba', email: 'prueba@ejemplo.com' };
    await app.cargar();
    await app.cargar();

    expect(nube.descargas).toBe(2);
    expect(app.cargado).toBe(true);
  });

  it('sin usuario no se descarga nada', async () => {
    sesion.usuario = null;
    await app.cargar();

    expect(nube.descargas).toBe(0);
  });
});
