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

import { Account, Client, Databases } from 'appwrite';

const ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
const PROJECT = import.meta.env.VITE_APPWRITE_PROJECT;
const DATABASE = import.meta.env.VITE_APPWRITE_DATABASE ?? 'recetario';

export const COLECCION_JORNADAS =
  import.meta.env.VITE_APPWRITE_COLECCION_JORNADAS ?? 'fichaje_jornadas';
export const COLECCION_AJUSTES =
  import.meta.env.VITE_APPWRITE_COLECCION_AJUSTES ?? 'fichaje_ajustes';

/** `true` si la app está configurada; si no, se muestra un aviso claro. */
export const configurado = Boolean(ENDPOINT && PROJECT);

export const client = new Client();

if (configurado) {
  client.setEndpoint(ENDPOINT).setProject(PROJECT);
}

export const account = new Account(client);
export const databases = new Databases(client);
export const idBaseDatos = DATABASE;

/** Error de red, que es el único que merece encolarse para reintentar. */
export function esFalloDeRed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const posible = error as { code?: number; type?: string; message?: string };
  if (posible.code === 0) return true;
  if (typeof posible.type === 'string' && posible.type.includes('network')) return true;
  if (typeof posible.message === 'string' && /fetch|network|offline/i.test(posible.message)) {
    return true;
  }
  return !navigator.onLine;
}
