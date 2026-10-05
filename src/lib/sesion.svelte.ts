/**
 * Sesión del usuario.
 *
 * Con la nube como fuente de la verdad hace falta saber quién eres para poder
 * leer y escribir, así que la app arranca con la puerta de acceso delante.
 * El inicio de sesión con Google lo gestiona Appwrite con una redirección
 * completa (no una ventana emergente), que es lo que funciona en una PWA
 * instalada en iOS.
 */

import { OAuthProvider } from 'appwrite';

import { account, configurado } from './appwrite';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
}

class EstadoSesion {
  usuario = $state<Usuario | null>(null);
  /** `true` mientras se comprueba si ya había sesión. */
  comprobando = $state(true);
  /** `true` mientras se lanza el inicio de sesión. */
  entrando = $state(false);
  error = $state<string | null>(null);

  /** URL a la que Appwrite devuelve al usuario tras el login. */
  private urlDeVuelta(): string {
    return `${window.location.origin}/`;
  }

  async comprobar(): Promise<void> {
    if (!configurado) {
      this.error = 'Falta la configuración de Appwrite en el entorno.';
      this.comprobando = false;
      return;
    }

    try {
      const cuenta = await account.get();
      this.usuario = { id: cuenta.$id, nombre: cuenta.name, email: cuenta.email };
      this.error = null;
    } catch {
      // Sin sesión: es lo normal la primera vez, no un error que enseñar.
      this.usuario = null;
    } finally {
      this.comprobando = false;
    }
  }

  entrarConGoogle(): void {
    if (!configurado || this.entrando) return;
    this.entrando = true;
    this.error = null;
    try {
      account.createOAuth2Session(
        OAuthProvider.Google,
        this.urlDeVuelta(),
        `${this.urlDeVuelta()}?acceso=fallido`,
      );
    } catch {
      this.entrando = false;
      this.error = 'No se ha podido abrir el inicio de sesión con Google.';
    }
  }

  async salir(): Promise<void> {
    try {
      await account.deleteSession('current');
    } catch {
      // Si la sesión ya no existía, da igual: lo que importa es olvidarla aquí.
    }
    this.usuario = null;
  }
}

export const sesion = new EstadoSesion();

/** ¿El usuario ha vuelto de Google con un fallo? */
export function accesoFallido(): boolean {
  return new URLSearchParams(window.location.search).get('acceso') === 'fallido';
}
