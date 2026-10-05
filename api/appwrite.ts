/**
 * Proxy hacia Appwrite.
 *
 * Por qué existe esto: Appwrite guarda la sesión en una cookie marcada con
 * **su** dominio:
 *
 *   set-cookie: a_session_xxx=...; domain=.fra.cloud.appwrite.io; secure; HttpOnly
 *
 * Para nuestra app esa cookie es de terceros y, además, el navegador la rechaza
 * porque el dominio no coincide con el nuestro. Resultado: entras con Google y
 * vuelves al botón de login, en bucle. Un `rewrite` de Vercel no sirve, porque
 * reenvía la cabecera tal cual; hay que **reescribirla**, y eso solo se puede
 * hacer con código.
 *
 * Así que todas las llamadas salen por `/appwrite/*`, pasan por aquí y vuelven
 * con el `domain=` quitado. La cookie se guarda entonces como de primera parte
 * (mismo sitio que la app) y el login funciona en Safari, iOS y Chrome.
 *
 * No hay ningún secreto aquí: sigue siendo el mismo endpoint público y el mismo
 * project ID. Los permisos se deciden, como antes, documento a documento con
 * `user:<id>`.
 */

export const config = { runtime: 'edge' };

const APPWRITE = 'https://fra.cloud.appwrite.io/v1';

/** Cabeceras que no deben reenviarse tal cual. */
const A_QUITAR = new Set(['host', 'content-length', 'accept-encoding', 'connection']);

export default async function handler(peticion: Request): Promise<Response> {
  const entrada = new URL(peticion.url);
  // La reescritura de Vercel entrega la ruta de Appwrite en `?ruta=`, porque el
  // `[...catch-all]` de Next no existe aquí y las rutas profundas darían 404.
  const ruta = (entrada.searchParams.get('ruta') ?? '').replace(/^\/+/, '');
  entrada.searchParams.delete('ruta');
  const destino = `${APPWRITE}/${ruta}${entrada.search}`;

  const cabeceras = new Headers();
  for (const [nombre, valor] of peticion.headers) {
    if (!A_QUITAR.has(nombre.toLowerCase())) cabeceras.set(nombre, valor);
  }
  // Sin compresión: así el cuerpo se reenvía tal cual y no hay dudas sobre si
  // hay que tocar `content-encoding`.
  cabeceras.set('accept-encoding', 'identity');

  const tieneCuerpo = peticion.method !== 'GET' && peticion.method !== 'HEAD';

  const respuesta = await fetch(destino, {
    method: peticion.method,
    headers: cabeceras,
    body: tieneCuerpo ? await peticion.arrayBuffer() : undefined,
    redirect: 'manual',
  });

  const salida = new Headers(respuesta.headers);
  salida.delete('content-length');
  salida.delete('content-encoding');

  // Aquí está el arreglo: fuera el `domain=` de Appwrite para que la cookie
  // pertenezca a nuestro dominio.
  const galletas = respuesta.headers.getSetCookie?.() ?? [];
  if (galletas.length > 0) {
    salida.delete('set-cookie');
    for (const galleta of galletas) {
      salida.append('set-cookie', galleta.replace(/;\s*domain=[^;]*/gi, ''));
    }
  }

  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: salida,
  });
}
