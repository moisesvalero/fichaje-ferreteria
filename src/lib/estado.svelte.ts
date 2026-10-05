/**
 * Estado global de la aplicación.
 *
 * La **nube es la fuente de la verdad**: al entrar se descarga el historial de
 * Appwrite y todo lo que se escribe va allí. Lo que hay en memoria es una copia
 * de lo que hay en el servidor, y el motor puro de `calculo.ts` calcula sobre
 * ella igual que antes.
 *
 * Dos cosas se mantienen del diseño anterior y siguen siendo necesarias: el
 * candado de escritura (el botón de fichar es el más pulsado de la app y una
 * doble pulsación no puede duplicar ni perder tramos) y las reglas del motor.
 *
 * Sin conexión no se puede fichar: es la contrapartida de tener los datos en la
 * nube, y la app lo dice claramente en vez de fingir que ha guardado.
 */

import {
  minutosJornada,
  olvidos,
  resumenDia,
  resumenSemana,
  saldoExtras,
  semanasSinCongelar,
  situacionActual,
  tramosOrdenados,
  type ObjetivosCongelados,
  type ResumenDia,
  type SaldoExtras,
  type Situacion,
} from './calculo';
import { aFecha } from './fechas';
import {
  actualizarJornada,
  borrarJornada as borrarJornadaNube,
  crearJornada,
  descargarAjustes,
  descargarJornadas,
  guardarAjustes as guardarAjustesNube,
} from './nube';
import { sesion } from './sesion.svelte';
import {
  AJUSTES_POR_DEFECTO,
  type Ajustes,
  type Jornada,
  type ResumenSemana,
  type Tramo,
} from './tipos';

const TICKS_PARA_REPOSO = 30;
const CLAVE_ULTIMA_DESCARGA = 'fichaje.ultimaDescarga';

function nuevoId(): string {
  return crypto.randomUUID();
}

function leerUltimaDescarga(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA_DESCARGA);
  } catch {
    return null;
  }
}

class EstadoApp {
  jornadas = $state<Jornada[]>([]);
  ajustes = $state<Ajustes>({ ...AJUSTES_POR_DEFECTO });
  /** Instante actual en milisegundos. Mueve el contador en vivo. */
  ahora = $state(Date.now());
  /** `true` cuando los datos del usuario ya están descargados. */
  cargado = $state(false);
  /** ISO de la última descarga del historial, o null. */
  ultimaDescarga = $state<string | null>(leerUltimaDescarga());
  /** Error visible para el usuario, o null. */
  error = $state<string | null>(null);
  /** Aviso no bloqueante, por ejemplo del resultado de una importación. */
  aviso = $state<string | null>(null);
  /** Número de escrituras pendientes en la cola. */
  private enCola = $state(0);
  /** `true` mientras hay alguna escritura pendiente: la interfaz desactiva los botones. */
  guardando = $derived(this.enCola > 0);

  /** Id del documento de Appwrite de cada fecha. */
  private idsPorFecha = new Map<string, string>();
  /** Id del documento de ajustes del usuario. */
  private idAjustes: string | null = null;
  /** Objetivo congelado de cada semana cerrada, por su lunes. */
  private objetivosSemanas = $state<ObjetivosCongelados>({});

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  /** Cola de escrituras: garantiza que la nube nunca recibe dos a la vez. */
  private cola: Promise<void> = Promise.resolve();

  /** Fecha de hoy, 'YYYY-MM-DD'. */
  hoy = $derived(aFecha(new Date(this.ahora)));

  /** Jornada de hoy, si existe. */
  jornadaHoy = $derived<Jornada | undefined>(this.jornadas.find((j) => j.fecha === this.hoy));

  /** Situación del fichaje: fuera, trabajando o en pausa. */
  situacion = $derived<Situacion>(situacionActual(this.jornadaHoy));

  /** Minutos trabajados hoy. */
  minutosHoy = $derived(
    this.jornadaHoy ? minutosJornada(this.jornadaHoy, this.hoy, this.ahora) : 0,
  );

  /** Resumen del día de hoy. */
  dia = $derived<ResumenDia>(resumenDia(this.jornadaHoy, this.ajustes, this.hoy, this.ahora));

  /** Resumen de la semana en curso. */
  semana = $derived<ResumenSemana>(
    resumenSemana(this.jornadas, this.ajustes, this.hoy, this.hoy, this.ahora),
  );

  /** Saldo de extras: firme (semanas cerradas) y provisional (semana en curso). */
  saldo = $derived<SaldoExtras>(
    saldoExtras(this.jornadas, this.ajustes, this.hoy, this.ahora, this.objetivosSemanas),
  );

  /** Tramos abiertos de días anteriores, pendientes de corregir. */
  pendientes = $derived(olvidos(this.jornadas, this.hoy));

  /** Arranca el reloj en vivo. No toca la red. */
  iniciarReloj(): void {
    if (this.temporizador !== null) return;
    this.temporizador = setInterval(() => this.tick(), 1000);
  }

  detener(): void {
    if (this.temporizador !== null) clearInterval(this.temporizador);
    this.temporizador = null;
  }

  private tick(): void {
    if (this.situacion === 'trabajando') {
      this.ahora = Date.now();
      return;
    }
    this.ticks += 1;
    if (this.ticks >= TICKS_PARA_REPOSO) {
      this.ticks = 0;
      this.ahora = Date.now();
    }
  }

  /** Descarga el historial del usuario que ha entrado. */
  async cargar(): Promise<void> {
    const usuario = sesion.usuario;
    if (usuario === null) return;

    this.cargado = false;
    this.error = null;
    try {
      const descarga = await descargarJornadas(usuario.id);
      this.jornadas = descarga.jornadas;
      this.idsPorFecha = descarga.idsPorFecha;

      const nube = await descargarAjustes(usuario.id);
      if (nube === null) {
        this.ajustes = { ...AJUSTES_POR_DEFECTO };
        this.idAjustes = await guardarAjustesNube(this.ajustes, {}, usuario.id, null);
      } else {
        this.ajustes = nube.ajustes;
        this.objetivosSemanas = nube.objetivosSemanas;
        this.idAjustes = nube.idDocumento;
      }

      if (descarga.descartados > 0) {
        this.aviso = `Se han descartado ${descarga.descartados} ${
          descarga.descartados === 1 ? 'registro dañado' : 'registros dañados'
        } al descargar.`;
      }

      await this.congelarSemanasCerradas();
      this.ahora = Date.now();
    } catch {
      this.error = 'No se ha podido descargar tu historial. Comprueba la conexión.';
    } finally {
      this.cargado = true;
    }
  }

  /** Vacía lo cargado al cerrar sesión. */
  olvidar(): void {
    this.jornadas = [];
    this.ajustes = { ...AJUSTES_POR_DEFECTO };
    this.objetivosSemanas = {};
    this.idsPorFecha = new Map();
    this.idAjustes = null;
    this.cargado = false;
    this.error = null;
    this.aviso = null;
  }

  /**
   * Encola una escritura para que nunca haya dos a la vez.
   *
   * No se descarta ninguna pulsación: se serializan. Descartarlas sería peor,
   * porque una pausa pulsada justo después de fichar se perdería y el reloj
   * seguiría corriendo. Cada acción es además idempotente, así que una doble
   * pulsación del mismo botón no duplica nada.
   */
  private encolar(accion: () => Promise<void>): Promise<boolean> {
    this.enCola += 1;

    const tarea = this.cola.then(async () => {
      try {
        await accion();
        this.error = null;
        return true;
      } catch {
        this.error = navigator.onLine
          ? 'No se ha podido guardar en la nube. Inténtalo otra vez.'
          : 'Sin conexión: no se ha podido guardar. Tu cambio no se ha aplicado.';
        return false;
      } finally {
        this.enCola -= 1;
      }
    });

    this.cola = tarea.then(
      () => undefined,
      () => undefined,
    );
    return tarea;
  }

  /** Guarda la jornada en la nube y, si va bien, la refleja en memoria. */
  private async persistir(jornada: Jornada): Promise<void> {
    const usuario = sesion.usuario;
    if (usuario === null) throw new Error('Sin sesión');

    const idExistente = this.idsPorFecha.get(jornada.fecha);
    if (idExistente === undefined) {
      const id = await crearJornada(jornada, usuario.id);
      this.idsPorFecha.set(jornada.fecha, id);
    } else {
      await actualizarJornada(idExistente, jornada, usuario.id);
    }

    const resto = this.jornadas.filter((j) => j.fecha !== jornada.fecha);
    this.jornadas = [...resto, jornada].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  private async persistirAjustes(): Promise<void> {
    const usuario = sesion.usuario;
    if (usuario === null) throw new Error('Sin sesión');
    this.idAjustes = await guardarAjustesNube(
      this.ajustes,
      this.objetivosSemanas,
      usuario.id,
      this.idAjustes,
    );
  }

  /**
   * Fija el objetivo de las semanas ya cerradas que aún no lo tuvieran.
   * A partir de ahí, cambiar el límite semanal afecta a las semanas siguientes,
   * no al saldo que ya está apuntado.
   */
  async congelarSemanasCerradas(): Promise<void> {
    const pendientes = semanasSinCongelar(
      this.jornadas,
      this.ajustes,
      this.hoy,
      this.ahora,
      this.objetivosSemanas,
    );
    if (Object.keys(pendientes).length === 0) return;

    this.objetivosSemanas = { ...this.objetivosSemanas, ...pendientes };
    await this.persistirAjustes();
  }

  /** Abre un tramo nuevo (fichar entrada o reanudar tras una pausa). */
  ficharEntrada(): Promise<boolean> {
    return this.encolar(async () => {
      const instante = Date.now();
      const jornada: Jornada = this.jornadaHoy ?? {
        fecha: this.hoy,
        tramos: [],
        tipo: 'laborable',
      };

      // Si ya hay un tramo abierto, esto es una doble pulsación: no se abre otro.
      if (situacionActual(jornada) === 'trabajando') return;

      const tramo: Tramo = { id: nuevoId(), inicio: instante, fin: null };
      await this.persistir({ ...jornada, tramos: [...jornada.tramos, tramo] });
      this.ahora = instante;
    });
  }

  /**
   * Cierra el tramo abierto. "Pausa" y "Fichar salida" cierran el mismo tramo:
   * la diferencia es solo lo que el usuario piensa hacer después, y la app no
   * necesita adivinarlo para medir bien el tiempo.
   */
  cerrarTramo(): Promise<boolean> {
    return this.encolar(async () => {
      const jornada = this.jornadaHoy;
      if (!jornada) return;

      // Se cierra el último tramo abierto por hora, no por orden de inserción.
      const abierto = tramosOrdenados(jornada)
        .filter((t) => t.fin === null)
        .at(-1);
      if (abierto === undefined) return;

      const instante = Math.max(Date.now(), abierto.inicio);
      await this.persistir({
        ...jornada,
        tramos: jornada.tramos.map((t) => (t.id === abierto.id ? { ...t, fin: instante } : t)),
      });
      this.ahora = instante;
    });
  }

  /** Guarda una jornada completa (alta o corrección manual). */
  guardar(jornada: Jornada): Promise<boolean> {
    return this.encolar(() => this.persistir(jornada));
  }

  eliminar(fecha: string): Promise<boolean> {
    return this.encolar(async () => {
      const id = this.idsPorFecha.get(fecha);
      if (id === undefined) return;

      await borrarJornadaNube(id);
      this.idsPorFecha.delete(fecha);
      this.jornadas = this.jornadas.filter((j) => j.fecha !== fecha);
    });
  }

  /** Cambia uno o varios ajustes y los persiste. */
  actualizarAjustes(cambios: Partial<Ajustes>): Promise<boolean> {
    return this.encolar(async () => {
      const anteriores = this.ajustes;
      this.ajustes = { ...this.ajustes, ...cambios };
      try {
        await this.persistirAjustes();
      } catch (fallo) {
        this.ajustes = anteriores;
        throw fallo;
      }
    });
  }

  /**
   * Vuelca en la nube un historial ya validado (importación de una copia).
   *
   * Appwrite no tiene transacciones entre documentos, así que la importación es
   * **idempotente** en lugar de atómica: cada jornada se escribe por su fecha y
   * repetirla completa lo que falte. Se devuelve cuántas se han escrito.
   */
  importar(jornadas: Jornada[], ajustes: Ajustes | null): Promise<number> {
    let escritas = 0;
    return this.encolar(async () => {
      for (const jornada of jornadas) {
        await this.persistir(jornada);
        escritas += 1;
      }
      if (ajustes !== null) {
        this.ajustes = ajustes;
        await this.persistirAjustes();
      }
    }).then(() => escritas);
  }

  /** Marca que se ha descargado una copia del historial. */
  marcarDescarga(): void {
    const instante = new Date().toISOString();
    this.ultimaDescarga = instante;
    try {
      localStorage.setItem(CLAVE_ULTIMA_DESCARGA, instante);
    } catch {
      // Sin localStorage la marca no persiste; no es grave.
    }
  }
}

export const app = new EstadoApp();
