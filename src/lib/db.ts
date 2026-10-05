/**
 * Persistencia local con IndexedDB (Dexie).
 *
 * No hay servidor, ni cuentas, ni sincronización: la base de datos vive en el
 * dispositivo. La copia de seguridad es un archivo que exporta el usuario, y
 * como es la única garantía real de conservación, al cargar se sanea lo que
 * haya y al importar se hace en una transacción que puede deshacerse entera.
 */

import Dexie, { type Table } from 'dexie';

import type { ObjetivosCongelados } from './calculo';
import { sanearJornada, validarAjustes } from './exportar';
import { AJUSTES_POR_DEFECTO, type Ajustes, type Jornada } from './tipos';

/** Los ajustes se guardan en una única fila con id fijo. */
export interface RegistroAjustes extends Ajustes {
  id: number;
}

/** Pares clave/valor para metadatos: última copia, versión, etc. */
export interface Meta {
  clave: string;
  valor: string;
}

export const CLAVE_AJUSTES = 1;
export const META_ULTIMA_COPIA = 'ultimaCopia';
export const META_OBJETIVOS = 'objetivosSemanas';

class BaseFichaje extends Dexie {
  jornadas!: Table<Jornada, string>;
  ajustes!: Table<RegistroAjustes, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super('fichaje-ferreteria');
    this.version(1).stores({
      jornadas: 'fecha, tipo',
      ajustes: 'id',
      meta: 'clave',
    });
  }
}

export const db = new BaseFichaje();

export interface CargaInicial {
  jornadas: Jornada[];
  ajustes: Ajustes;
  ultimaCopia: string | null;
  /** Registros que estaban en la base pero no eran utilizables. */
  descartadas: number;
}

/**
 * Carga la base completa.
 * Sanea lo que encuentre: si una versión anterior dejó un registro corrupto, la
 * app arranca igualmente en lugar de romperse en cada pantalla, y el registro
 * dañado se borra para no arrastrarlo.
 */
export async function cargarTodo(): Promise<CargaInicial> {
  const [jornadasBrutas, registro, meta] = await Promise.all([
    db.jornadas.toArray(),
    db.ajustes.get(CLAVE_AJUSTES),
    db.meta.get(META_ULTIMA_COPIA),
  ]);

  const jornadas: Jornada[] = [];
  const fechasDanadas: string[] = [];

  for (const bruta of jornadasBrutas) {
    const saneada = sanearJornada(bruta);
    if (saneada === null) {
      if (typeof (bruta as Jornada)?.fecha === 'string')
        fechasDanadas.push((bruta as Jornada).fecha);
      continue;
    }
    jornadas.push(saneada.jornada);
  }

  if (fechasDanadas.length > 0) {
    await db.jornadas.bulkDelete(fechasDanadas);
  }

  const ajustesValidados = validarAjustes(registro);
  if (ajustesValidados === null) {
    await db.ajustes.put({ id: CLAVE_AJUSTES, ...AJUSTES_POR_DEFECTO });
  }

  return {
    jornadas: jornadas.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    ajustes: ajustesValidados ?? AJUSTES_POR_DEFECTO,
    ultimaCopia: meta?.valor ?? null,
    descartadas: fechasDanadas.length,
  };
}

export async function guardarJornada(jornada: Jornada): Promise<void> {
  await db.jornadas.put(jornada);
}

export async function borrarJornada(fecha: string): Promise<void> {
  await db.jornadas.delete(fecha);
}

export async function guardarAjustes(ajustes: Ajustes): Promise<void> {
  await db.ajustes.put({ id: CLAVE_AJUSTES, ...ajustes });
}

/**
 * Restaura una copia de seguridad en una sola transacción.
 * Si algo falla a mitad, IndexedDB deshace todo: nunca queda media copia aplicada.
 */
export async function importarCopia(jornadas: Jornada[], ajustes: Ajustes | null): Promise<void> {
  await db.transaction('rw', db.jornadas, db.ajustes, async () => {
    for (const jornada of jornadas) {
      await db.jornadas.put(jornada);
    }
    if (ajustes !== null) {
      await db.ajustes.put({ id: CLAVE_AJUSTES, ...ajustes });
    }
  });
}

/**
 * Lee los objetivos congelados de las semanas ya cerradas.
 * Si el registro está corrupto se devuelve un mapa vacío: se volverán a congelar.
 */
export async function leerObjetivosSemanas(): Promise<ObjetivosCongelados> {
  try {
    const registro = await db.meta.get(META_OBJETIVOS);
    if (registro === undefined) return {};
    const datos: unknown = JSON.parse(registro.valor);
    if (typeof datos !== 'object' || datos === null) return {};

    const limpio: ObjetivosCongelados = {};
    for (const [lunes, minutos] of Object.entries(datos as Record<string, unknown>)) {
      if (typeof minutos === 'number' && Number.isFinite(minutos) && minutos >= 0) {
        limpio[lunes] = minutos;
      }
    }
    return limpio;
  } catch {
    return {};
  }
}

export async function guardarObjetivosSemanas(objetivos: ObjetivosCongelados): Promise<void> {
  await db.meta.put({ clave: META_OBJETIVOS, valor: JSON.stringify(objetivos) });
}

export async function marcarCopiaHecha(instante: string): Promise<void> {
  await db.meta.put({ clave: META_ULTIMA_COPIA, valor: instante });
}

/**
 * Pide al navegador que no borre los datos por falta de espacio.
 * En iOS esto es la diferencia entre conservar el historial o perderlo.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Espacio ocupado por la base de datos, en bytes, si el navegador lo informa. */
export async function espacioUsado(): Promise<number | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  } catch {
    return null;
  }
}
