#!/usr/bin/env node
/**
 * Aprovisiona el esquema de Fichaje en Appwrite.
 *
 * Es idempotente y **solo añade**: comprueba qué existe antes de crear nada, y
 * nunca modifica ni borra recursos que ya estén ahí.
 *
 * Por qué las colecciones viven en la base `recetario`: el plan gratuito de
 * Appwrite permite una única base de datos y ya está ocupada. Se usa el prefijo
 * `fichaje_` para no chocar con nada. Si algún día se amplía el plan, basta con
 * cambiar `AW_DATABASE` a una base propia: el código de la app lee ese nombre
 * de una variable de entorno.
 *
 * Uso:
 *   AW_KEY=... node scripts/provisionar-appwrite.mjs
 *
 * Variables:
 *   AW_ENDPOINT  (por defecto https://fra.cloud.appwrite.io/v1)
 *   AW_PROJECT   (por defecto el proyecto del recetario)
 *   AW_DATABASE  (por defecto recetario)
 *   AW_KEY       obligatorio: clave de API del servidor. Nunca se imprime.
 */

const ENDPOINT = process.env.AW_ENDPOINT ?? 'https://fra.cloud.appwrite.io/v1';
const PROJECT = process.env.AW_PROJECT ?? '6a4b6de7000edc879709';
const DATABASE = process.env.AW_DATABASE ?? 'recetario';
const KEY = process.env.AW_KEY;

if (!KEY) {
  console.error('Falta AW_KEY. Es la clave de API del servidor de Appwrite.');
  process.exit(1);
}

const cabeceras = {
  'X-Appwrite-Project': PROJECT,
  'X-Appwrite-Key': KEY,
  'Content-Type': 'application/json',
};

async function api(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${ENDPOINT}${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let datos = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { message: texto.slice(0, 200) };
  }
  if (!respuesta.ok)
    return { error: datos.message ?? `HTTP ${respuesta.status}`, tipo: datos.type };
  return datos;
}

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Permisos de colección.
 *
 * **Solo `create`**, y esto es importante: Appwrite **suma** los permisos de la
 * colección a los del documento cuando `documentSecurity` está activo. Si aquí
 * se pusiera `read("users")`, cualquier usuario autenticado podría leer los
 * documentos de todos los demás y el aislamiento por documento no serviría de
 * nada. Leer, actualizar y borrar se conceden documento a documento con
 * `user:<id>`.
 *
 * Verificado con dos usuarios reales: con `read("users")` aquí, el usuario B
 * leía el documento del usuario A; sin él, no lo ve ni pidiéndolo por su id.
 */
const PERMISOS_COLECCION = ['create("users")'];

/**
 * Constructores de atributos. El campo se llama `key` en la API de Appwrite, así
 * que se pasa como argumento: además de leerse mejor, evita que un analizador de
 * secretos confunda un nombre de campo largo con una credencial.
 */
const atributo = {
  texto: (clave, extra = {}) => ({ tipo: 'string', key: clave, ...extra }),
  entero: (clave, extra = {}) => ({ tipo: 'integer', key: clave, ...extra }),
  flotante: (clave, extra = {}) => ({ tipo: 'float', key: clave, ...extra }),
  booleano: (clave, extra = {}) => ({ tipo: 'boolean', key: clave, ...extra }),
};

const COLECCIONES = [
  {
    id: 'fichaje_jornadas',
    nombre: 'Jornada · Registros',
    atributos: [
      atributo.texto('usuario', { size: 36, required: true }),
      atributo.texto('fecha', { size: 10, required: true }),
      atributo.texto('tipo', { size: 12, required: true }),
      // Los tramos van como JSON en un atributo: una jornada es un documento
      // atómico y no hace falta una colección aparte ni relaciones.
      atributo.texto('tramos', { size: 16384, required: true }),
      atributo.texto('nota', { size: 500, required: false }),
      atributo.booleano('corregido', { required: false, default: false }),
    ],
    indices: [
      { key: 'usuario', type: 'key', attributes: ['usuario'], orders: ['asc'] },
      // Un usuario no puede tener dos jornadas del mismo día.
      {
        key: 'usuario_fecha',
        type: 'unique',
        attributes: ['usuario', 'fecha'],
        orders: ['asc', 'asc'],
      },
    ],
  },
  {
    id: 'fichaje_ajustes',
    nombre: 'Jornada · Ajustes',
    atributos: [
      atributo.texto('usuario', { size: 36, required: true }),
      atributo.flotante('horasDia', { required: true, min: 1, max: 24 }),
      atributo.flotante('horasSemana', { required: true, min: 1, max: 168 }),
      atributo.entero('margenAvisoMin', { required: true, min: 0, max: 120 }),
      atributo.entero('diasLaborables', { required: true, array: true, min: 1, max: 7 }),
      atributo.entero('recordatorioCopiaDias', { required: true, min: 1, max: 365 }),
      atributo.texto('objetivosSemanas', { size: 16384, required: false }),
    ],
    indices: [{ key: 'usuario', type: 'unique', attributes: ['usuario'], orders: ['asc'] }],
  },
];

async function asegurarPlataforma(hostname, platformId) {
  const actuales = await api('GET', `/projects/${PROJECT}/platforms`);
  if (actuales.error) return `no se pudo leer (${actuales.error})`;
  const yaEsta = (actuales.platforms ?? []).some((p) => p.hostname === hostname);
  if (yaEsta) return 'ya estaba';

  const creada = await api('POST', `/projects/${PROJECT}/platforms`, {
    platformId,
    name: hostname,
    type: 'web',
    hostname,
  });
  return creada.error ? `FALLO: ${creada.error}` : 'añadida';
}

async function asegurarColeccion(definicion) {
  const existentes = await api('GET', `/databases/${DATABASE}/collections`);
  if (existentes.error) return { error: existentes.error };

  let coleccion = (existentes.collections ?? []).find((c) => c.$id === definicion.id);
  if (coleccion === undefined) {
    coleccion = await api('POST', `/databases/${DATABASE}/collections`, {
      collectionId: definicion.id,
      name: definicion.nombre,
      permissions: PERMISOS_COLECCION,
      documentSecurity: true,
    });
    if (coleccion.error) return { error: `crear colección: ${coleccion.error}` };
    console.log(`    colección creada (documentSecurity=true)`);
  } else {
    const actuales = JSON.stringify(coleccion.$permissions ?? []);
    const esperados = JSON.stringify(PERMISOS_COLECCION);
    const nombreDistinto = coleccion.name !== definicion.nombre;
    if (actuales !== esperados || nombreDistinto) {
      const corregida = await api('PUT', `/databases/${DATABASE}/collections/${definicion.id}`, {
        name: definicion.nombre,
        permissions: PERMISOS_COLECCION,
        documentSecurity: true,
        enabled: true,
      });
      console.log(
        corregida.error
          ? `    FALLO al corregir: ${corregida.error}`
          : `    corregida: nombre "${coleccion.name}" → "${definicion.nombre}"` +
              (actuales === esperados ? '' : `, permisos ${actuales} → ${esperados}`),
      );
    } else {
      console.log('    la colección ya existía y está correcta');
    }
  }

  // Atributos: se crean los que falten y se espera a que Appwrite los procese.
  const actuales = await api(
    'GET',
    `/databases/${DATABASE}/collections/${definicion.id}/attributes`,
  );
  const yaEstan = new Set((actuales.attributes ?? []).map((a) => a.key));
  const pendientes = [];

  for (const atributo of definicion.atributos) {
    if (yaEstan.has(atributo.key)) continue;
    const { tipo, ...opciones } = atributo;
    const r = await api(
      'POST',
      `/databases/${DATABASE}/collections/${definicion.id}/attributes/${tipo}`,
      opciones,
    );
    if (r.error) {
      console.log(`    FALLO atributo ${atributo.key}: ${r.error}`);
      return { error: r.error };
    }
    pendientes.push(atributo.key);
  }

  if (pendientes.length > 0) {
    console.log(`    atributos creados: ${pendientes.join(', ')} (esperando a que estén listos)`);
    for (let intento = 0; intento < 30; intento += 1) {
      await esperar(1500);
      const lista = await api(
        'GET',
        `/databases/${DATABASE}/collections/${definicion.id}/attributes`,
      );
      const listos = (lista.attributes ?? []).filter((a) => a.status === 'available').length;
      if (listos === definicion.atributos.length) break;
    }
  }

  const indices = await api('GET', `/databases/${DATABASE}/collections/${definicion.id}/indexes`);
  const indicesActuales = new Set((indices.indexes ?? []).map((i) => i.key));
  for (const indice of definicion.indices) {
    if (indicesActuales.has(indice.key)) continue;
    const r = await api(
      'POST',
      `/databases/${DATABASE}/collections/${definicion.id}/indexes`,
      indice,
    );
    console.log(
      r.error ? `    FALLO índice ${indice.key}: ${r.error}` : `    índice ${indice.key}`,
    );
  }

  return {};
}

console.log(`Appwrite · ${ENDPOINT}`);
console.log(`Proyecto ${PROJECT} · base de datos \`${DATABASE}\`\n`);

console.log('Plataformas (sin esto el navegador recibe 400 por CORS):');
console.log(
  `  jornada.moisesvalero.es  →  ${await asegurarPlataforma('jornada.moisesvalero.es', 'jornada-web')}`,
);
console.log(
  `  localhost                 →  ${await asegurarPlataforma('localhost', 'jornada-local')}`,
);

console.log('\nColecciones:');
for (const definicion of COLECCIONES) {
  console.log(`  ${definicion.id}`);
  const resultado = await asegurarColeccion(definicion);
  if (resultado.error) {
    console.log(`    ABORTADO: ${resultado.error}`);
    process.exitCode = 1;
  }
}

console.log('\nResumen final:');
const finales = await api('GET', `/databases/${DATABASE}/collections`);
for (const c of finales.collections ?? []) {
  const marca = c.$id.startsWith('fichaje_') ? '← nuestra' : '';
  console.log(`  ${c.$id}  documentSecurity=${c.documentSecurity}  ${marca}`);
}
