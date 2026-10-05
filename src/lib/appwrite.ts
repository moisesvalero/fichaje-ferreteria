/**
 * Cliente de Appwrite.
 *
 * Los datos viven en la nube y cada usuario solo puede ver los suyos: la
 * colección tiene `documentSecurity` activado, así que el permiso se decide
 * documento a documento con `user:<id>`. La clave de API del servidor **no**
 * está aquí ni puede estarlo: en el navegador solo hay endpoint y project ID,
 * que son públicos por diseño.
 *
 * La configuración llega por variables de entorno de Vite para que el repositorio
 * no lleve incrustado el proyecto de nadie: quien clone esto pone el suyo.
 */

import { Account, Client, Databases, OAuthProvider } from 'appwrite';

/**
 * Las llamadas a Appwrite salen por **nuestro propio dominio**, con un proxy
 * (reescritura en Vercel y proxy en el servidor de desarrollo). No es un capricho:
 * Appwrite guarda la sesión en una cookie de SU dominio, y para nuestra app esa
 * cookie es de terceros, así que Safari y Chrome la bloquean y el login se queda
 * en bucle: entras con Google y vuelves al botón. Pasando por nuestro dominio, la
 * cookie se guarda como de primera parte y el login funciona.
 *
 * Si se define `VITE_APPWRITE_ENDPOINT` se respeta (útil para apuntar a otro
 * proyecto), pero por defecto se usa el proxy del propio origen.
 */
const ENDPOINT =
  import.meta.env.VITE_APPWRITE_ENDPOINT ||
  (typeof window === 'undefined' ? '' : `${window.location.origin}/appwrite`);
const PROJECT = import.meta.env.VITE_APPWRITE_PROJECT;
const DATABASE = import.meta.env.VITE_APPWRITE_DATABASE ?? 'recetario';

export const COLECCION_JORNADAS =
  import.meta.env.VITE_APPWRITE_COLECCION_JORNADAS ?? 'fichaje_jornadas';
export const COLECCION_AJUSTES =
  import.meta.env.VITE_APPWRITE_COLECCION_AJUSTES ?? 'fichaje_ajustes';

/** `true` si la app está configurada; si no, se muestra un aviso claro. */
export const configurado = Boolean(ENDPOINT && PROJECT);

/** Endpoint de Appwrite sin pasar por el proxy. Ver `abrirLoginConGoogle`. */
export const ENDPOINT_DIRECTO = 'https://fra.cloud.appwrite.io/v1';

export const client = new Client();

if (configurado) {
  client.setEndpoint(ENDPOINT).setProject(PROJECT);
}

export const account = new Account(client);
export const databases = new Databases(client);
export const idBaseDatos = DATABASE;

/**
 * La sesión ha caducado o se ha revocado. No es un fallo de red: reintentar no
 * sirve de nada, hay que volver a entrar.
 */
export function esSesionCaducada(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { code?: number }).code === 401;
}

/**
 * Lanza el login con Google **directamente contra Appwrite**, sin el proxy.
 *
 * Es la única llamada que no puede pasar por nuestro dominio, y el motivo es una
 * cookie: al empezar el login, Appwrite deja `a_oauth2_<proyecto>` con el estado
 * de la operación, y esa cookie **no lleva `domain=`**, así que el navegador la
 * asigna al host que responde. Si la petición sale por el proxy, la cookie se
 * queda en nuestro dominio; la vuelta desde Google llega a Appwrite, que no la
 * recibe, no puede validar el estado y manda al usuario al aviso de fallo.
 *
 * El resto de llamadas sí van por el proxy, que es lo que hace que la cookie de
 * sesión sea de primera parte.
 */
export function abrirLoginConGoogle(exito: string, fallo: string): void {
  const anterior = client.config.endpoint;
  client.setEndpoint(ENDPOINT_DIRECTO);
  try {
    account.createOAuth2Token(OAuthProvider.Google, exito, fallo);
  } finally {
    client.setEndpoint(anterior);
  }
}
