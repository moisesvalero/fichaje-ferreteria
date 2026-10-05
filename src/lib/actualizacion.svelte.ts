/**
 * Aviso de versión nueva.
 *
 * Con `registerType: 'prompt'` el service worker se instala pero no toma el
 * control hasta que se le dice. Así la app nunca se recarga sola en mitad de una
 * corrección: avisa y el usuario decide cuándo actualizar.
 */

type AplicarActualizacion = (recargar?: boolean) => Promise<void>;

class EstadoActualizacion {
  /** `true` cuando hay una versión nueva esperando. */
  disponible = $state(false);
  /** `true` mientras se está aplicando, para no pulsar dos veces. */
  aplicando = $state(false);

  private aplicarSW: AplicarActualizacion | null = null;

  registrar(aplicar: AplicarActualizacion): void {
    this.aplicarSW = aplicar;
  }

  marcarDisponible(): void {
    this.disponible = true;
  }

  async aplicar(): Promise<void> {
    if (!this.aplicarSW || this.aplicando) return;
    this.aplicando = true;
    try {
      // `true` recarga la página una vez el service worker nuevo toma el control.
      await this.aplicarSW(true);
    } finally {
      this.aplicando = false;
    }
  }

  descartar(): void {
    this.disponible = false;
  }
}

export const actualizacion = new EstadoActualizacion();
