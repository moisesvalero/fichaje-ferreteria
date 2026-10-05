/**
 * Acceso a los datos en Appwrite.
 *
 * Es la única puerta a la nube, igual que `sanearJornada` es la única puerta de
 * validación: todo lo que entra se sanea con las mismas funciones que la copia
 * de seguridad, así que no hay dos validaciones que puedan divergir.
 *
 * La nube es la fuente de la verdad. Los datos en memoria son una copia de lo
 * que hay allí; si una escritura falla por red, se encola y se reintenta.
 */

import { ID, Permission, Query, Role } from 'appwrite';

import { COLECCION_AJUSTES, COLECCION_JORNADAS, databases, idBaseDatos } from './appwrite';
import { sanearJornada, validarAjustes } from './exportar';
import { AJUSTES_POR_DEFECTO, type Ajustes, type Jornada } from './tipos';

/**
 * Documentos por página al paginar. Appwrite devuelve 25 si no se pide nada y
 * admite hasta 100 por consulta, así que se pide el máximo para reducir viajes.
 */
const PAGINA = 100;

export interface DocumentoJornada {
  $id: string;
  usuario: string;
  fecha: string;
  tipo: string;
  tramos: string;
  nota?: string;
  corregido?: boolean;
}

interface DocumentoAjustes {
  $id: string;
  usuario: string;
  horasDia: number;
  horasSemana: number;
  margenAvisoMin: number;
  diasLaborables: number[];
  recordatorioCopiaDias: number;
  objetivosSemanas?: string;
}

/** Documento de Appwrite a jornada del dominio, pasando por el saneador. */
function aJornada(documento: DocumentoJornada): Jornada | null {
  let tramos: unknown;
  try {
    tramos = JSON.parse(documento.tramos);
  } catch {
    return null;
  }
  if (!Array.isArray(tramos)) return null;

  // Se reutiliza el mismo saneador que la copia de seguridad: una sola puerta
  // de validación, así que no pueden divergir.
  const saneada = sanearJornada({
    fecha: documento.fecha,
    tipo: documento.tipo,
    tramos,
    nota: documento.nota,
    corregido: documento.corregido,
  });

  return saneada === null ? null : saneada.jornada;
}

function aDocumento(jornada: Jornada, usuario: string) {
  return {
    usuario,
    fecha: jornada.fecha,
    tipo: jornada.tipo,
    tramos: JSON.stringify(jornada.tramos),
    nota: jornada.nota ?? null,
    corregido: jornada.corregido ?? false,
  };
}

function permisosDe(usuario: string) {
  return [
    Permission.read(Role.user(usuario)),
    Permission.update(Role.user(usuario)),
    Permission.delete(Role.user(usuario)),
  ];
}

/** Recorre todas las páginas de una consulta. */
async function listarTodo<T>(coleccion: string, consultas: string[]): Promise<T[]> {
  const documentos: T[] = [];
  for (let pagina = 0; pagina < 200; pagina += 1) {
    const respuesta = await databases.listDocuments(idBaseDatos, coleccion, [
      ...consultas,
      Query.limit(PAGINA),
      Query.offset(pagina * PAGINA),
    ]);
    documentos.push(...(respuesta.documents as unknown as T[]));
    if (respuesta.documents.length < PAGINA) break;
  }
  return documentos;
}

export interface Descarga {
  jornadas: Jornada[];
  /** Documentos que llegaron de la nube pero no pasaron la validación. */
  descartados: number;
  /** Id del documento de cada fecha, para poder actualizarlo después. */
  idsPorFecha: Map<string, string>;
}

export async function descargarJornadas(usuario: string): Promise<Descarga> {
  const documentos = await listarTodo<DocumentoJornada>(COLECCION_JORNADAS, [
    Query.equal('usuario', usuario),
    Query.orderAsc('fecha'),
  ]);

  const jornadas: Jornada[] = [];
  const idsPorFecha = new Map<string, string>();
  let descartados = 0;

  for (const documento of documentos) {
    const jornada = aJornada(documento);
    if (jornada === null) {
      descartados += 1;
      continue;
    }
    jornadas.push(jornada);
    idsPorFecha.set(jornada.fecha, documento.$id);
  }

  return { jornadas, descartados, idsPorFecha };
}

export async function crearJornada(jornada: Jornada, usuario: string): Promise<string> {
  const creado = await databases.createDocument(
    idBaseDatos,
    COLECCION_JORNADAS,
    ID.unique(),
    aDocumento(jornada, usuario),
    permisosDe(usuario),
  );
  return creado.$id;
}

export async function actualizarJornada(
  idDocumento: string,
  jornada: Jornada,
  usuario: string,
): Promise<void> {
  await databases.updateDocument(
    idBaseDatos,
    COLECCION_JORNADAS,
    idDocumento,
    aDocumento(jornada, usuario),
  );
}

/**
 * Borra una jornada. No recibe el usuario a propósito: el documento lleva su
 * propio permiso `delete("user:<id>")`, así que el servidor rechaza el borrado
 * si quien lo intenta no es su dueño.
 */
export async function borrarJornada(idDocumento: string): Promise<void> {
  await databases.deleteDocument(idBaseDatos, COLECCION_JORNADAS, idDocumento);
}

export interface AjustesNube {
  ajustes: Ajustes;
  objetivosSemanas: Record<string, number>;
  idDocumento: string;
}

export async function descargarAjustes(usuario: string): Promise<AjustesNube | null> {
  const respuesta = await databases.listDocuments(idBaseDatos, COLECCION_AJUSTES, [
    Query.equal('usuario', usuario),
    Query.limit(1),
  ]);

  const documento = respuesta.documents[0] as unknown as DocumentoAjustes | undefined;
  if (documento === undefined) return null;

  const ajustes = validarAjustes(documento);

  let objetivosSemanas: Record<string, number> = {};
  if (typeof documento.objetivosSemanas === 'string' && documento.objetivosSemanas !== '') {
    try {
      const crudo: unknown = JSON.parse(documento.objetivosSemanas);
      if (typeof crudo === 'object' && crudo !== null) {
        for (const [lunes, minutos] of Object.entries(crudo as Record<string, unknown>)) {
          if (typeof minutos === 'number' && Number.isFinite(minutos) && minutos >= 0) {
            objetivosSemanas[lunes] = minutos;
          }
        }
      }
    } catch {
      objetivosSemanas = {};
    }
  }

  return {
    ajustes: ajustes ?? AJUSTES_POR_DEFECTO,
    objetivosSemanas,
    idDocumento: documento.$id,
  };
}

export async function guardarAjustes(
  ajustes: Ajustes,
  objetivosSemanas: Record<string, number>,
  usuario: string,
  idDocumento: string | null,
): Promise<string> {
  const cuerpo = {
    usuario,
    horasDia: ajustes.horasDia,
    horasSemana: ajustes.horasSemana,
    margenAvisoMin: ajustes.margenAvisoMin,
    diasLaborables: ajustes.diasLaborables,
    recordatorioCopiaDias: ajustes.recordatorioCopiaDias,
    objetivosSemanas: JSON.stringify(objetivosSemanas),
  };

  if (idDocumento !== null) {
    await databases.updateDocument(idBaseDatos, COLECCION_AJUSTES, idDocumento, cuerpo);
    return idDocumento;
  }

  const creado = await databases.createDocument(
    idBaseDatos,
    COLECCION_AJUSTES,
    ID.unique(),
    cuerpo,
    permisosDe(usuario),
  );
  return creado.$id;
}
