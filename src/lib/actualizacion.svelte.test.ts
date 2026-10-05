import { beforeEach, describe, expect, it, vi } from 'vitest';

import { actualizacion } from './actualizacion.svelte';

describe('aviso de versión nueva', () => {
  beforeEach(() => {
    actualizacion.descartar();
    actualizacion.registrar(async () => {});
  });

  it('no avisa hasta que el service worker lo dice', () => {
    expect(actualizacion.disponible).toBe(false);
  });

  it('avisa cuando hay una versión esperando', () => {
    actualizacion.marcarDisponible();
    expect(actualizacion.disponible).toBe(true);
  });

  it('aplicar llama al service worker pidiendo recarga', async () => {
    const aplicar = vi.fn(async () => {});
    actualizacion.registrar(aplicar);

    await actualizacion.aplicar();
    expect(aplicar).toHaveBeenCalledWith(true);
  });

  it('no aplica dos veces a la vez', async () => {
    let resolver: () => void = () => {};
    const aplicar = vi.fn(
      () =>
        new Promise<void>((resolverInterno) => {
          resolver = resolverInterno;
        }),
    );
    actualizacion.registrar(aplicar);

    const primera = actualizacion.aplicar();
    const segunda = actualizacion.aplicar();
    resolver();
    await Promise.all([primera, segunda]);

    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(actualizacion.aplicando).toBe(false);
  });

  it('no revienta si el service worker no ha llegado a registrarse', async () => {
    actualizacion.registrar(undefined as never);
    await expect(actualizacion.aplicar()).resolves.toBeUndefined();
    expect(actualizacion.aplicando).toBe(false);
  });
});
