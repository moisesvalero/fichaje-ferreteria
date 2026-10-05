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

/**
 * `createOAuth2Token` figura como obsoleta en el SDK, pero es el flujo que
 * permite canjear el token por una sesión desde nuestro propio dominio.
 * `createOAuth2Session` deja que Appwrite ponga la cookie en una redirección
 * suya, y esa cookie es de terceros: Safari y Chrome la bloquean y el login
 * vuelve siempre al mismo botón.
 */
const pedirToken = account.createOAuth2Token.bind(account) as (
  proveedor: OAuthProvider,
  exito: string,
  fallo: string,
) => void;

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

  /** Quita los parámetros del login de la barra de direcciones. */
  private limpiarUrl(): void {
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }

  async comprobar(): Promise<void> {
    if (!configurado) {
      this.error = 'Falta la configuración de Appwrite en el entorno.';
      this.comprobando = false;
      return;
    }

    const parametros = new URLSearchParams(window.location.search);

    // Google ha devuelto un fallo: se dice, en vez de volver al botón como si
    // no hubiera pasado nada.
    if (parametros.get('acceso') === 'fallido') {
      this.limpiarUrl();
      this.error = 'Google no ha completado el acceso. Inténtalo otra vez.';
      this.entrando = false;
      this.comprobando = false;
      return;
    }

    // Vuelta de Google: se canjea el token por una sesión. El canje va por
    // nuestro dominio, así que la cookie que se guarda es de primera parte.
    const userId = parametros.get('userId');
    const secret = parametros.get('secret');
    if (userId !== null && secret !== null) {
      try {
        await account.createSession(userId, secret);
      } catch {
        this.limpiarUrl();
        this.error = 'No se ha podido completar el acceso. Inténtalo otra vez.';
        this.entrando = false;
        this.comprobando = false;
        return;
      }
      this.limpiarUrl();
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
      this.entrando = false;
    }
  }

  entrarConGoogle(): void {
    if (!configurado || this.entrando) return;
    this.entrando = true;
    this.error = null;
    try {
      pedirToken(
        OAuthProvider.Google,
        `${this.urlDeVuelta()}?acceso=ok`,
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
