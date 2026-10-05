/**
 * Estado global de la aplicación.
 *
 * Todo lo que la interfaz muestra sale de aquí, y todo lo que aquí se calcula
 * sale del motor puro de `calculo.ts`. La hora actual es estado reactivo para
 * que el contador avance solo, y se refresca cada segundo únicamente mientras
 * hay un tramo abierto; en reposo basta con refrescar cada medio minuto.
 *
 * Las escrituras pasan por un candado: el botón de fichar es el más pulsado de
 * la app y una doble pulsación no puede duplicar ni perder tramos.
 */

import {
  minutosJornada,
  olvidos,
  resumenDia,
  resumenSemana,
  saldoExtras,
  situacionActual,
  tramosOrdenados,
  type ResumenDia,
  type SaldoExtras,
  type Situacion,
} from './calculo';
import {
  borrarJornada,
  cargarTodo,
  guardarAjustes,
  guardarJornada,
  importarCopia,
  pedirAlmacenamientoPersistente,
} from './db';
import { aFecha } from './fechas';
import {
  AJUSTES_POR_DEFECTO,
  type Ajustes,
  type Jornada,
  type ResumenSemana,
  type Tramo,
} from './tipos';

const TICKS_PARA_REPOSO = 30;

function nuevoId(): string {
  return crypto.randomUUID();
}

class EstadoApp {
  jornadas = $state<Jornada[]>([]);
  ajustes = $state<Ajustes>({ ...AJUSTES_POR_DEFECTO });
  /** Instante actual en milisegundos. Mueve el contador en vivo. */
  ahora = $state(Date.now());
  cargado = $state(false);
  copiaPersistente = $state(false);
  /** ISO de la última copia de seguridad, o null si nunca se ha hecho. */
  ultimaCopia = $state<string | null>(null);
  /** Número de escrituras pendientes en la cola. */
  private enCola = $state(0);
  /** `true` mientras hay alguna escritura pendiente: la interfaz desactiva los botones. */
  guardando = $derived(this.enCola > 0);
  /** Error visible para el usuario, o null. */
  error = $state<string | null>(null);
  /** Aviso no bloqueante, por ejemplo del resultado de una importación. */
  aviso = $state<string | null>(null);

  private temporizador: ReturnType<typeof setInterval> | null = null;
  private ticks = 0;
  /** Cola de escrituras: garantiza que IndexedDB nunca recibe dos a la vez. */
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
  saldo = $derived<SaldoExtras>(saldoExtras(this.jornadas, this.ajustes, this.hoy, this.ahora));

  /** Tramos abiertos de días anteriores, pendientes de corregir. */
  pendientes = $derived(olvidos(this.jornadas, this.hoy));

  async iniciar(): Promise<void> {
    // El temporizador se arranca antes de cualquier espera: si la base de datos
    // falla, el reloj sigue vivo y la app no se queda congelada.
    this.temporizador = setInterval(() => this.tick(), 1000);

    try {
      const { jornadas, ajustes, ultimaCopia, descartadas } = await cargarTodo();
      this.jornadas = jornadas;
      this.ajustes = ajustes;
      this.ultimaCopia = ultimaCopia;
      if (descartadas > 0) {
        this.aviso = `Se han descartado ${descartadas} ${
          descartadas === 1 ? 'registro dañado' : 'registros dañados'
        } al cargar.`;
      }
    } catch {
      this.error =
        'No se han podido leer los datos de este dispositivo. Puedes seguir fichando, pero revisa el almacenamiento del navegador.';
    } finally {
      this.cargado = true;
      this.ahora = Date.now();
    }

    this.copiaPersistente = await pedirAlmacenamientoPersistente();
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

  /**
   * Encola una escritura para que nunca haya dos a la vez.
   *
   * No se descarta ninguna pulsación: se serializan. Descartarlas sería peor,
   * porque una pausa pulsada justo después de fichar se perdería y el reloj
   * seguiría corriendo. Cada acción es además idempotente, así que una doble
   * pulsación del mismo botón no duplica nada.
   */
  private encolar(accion: () => Promise<void>): Promise<void> {
    this.enCola += 1;

    const tarea = this.cola.then(async () => {
      try {
        await accion();
        this.error = null;
      } catch {
        this.error = 'No se ha podido guardar el cambio en este dispositivo.';
      } finally {
        this.enCola -= 1;
      }
    });

    this.cola = tarea.catch(() => undefined);
    return tarea;
  }

  /** Aplica una jornada en memoria, sustituyendo la del mismo día. */
  private aplicar(jornada: Jornada): void {
    const resto = this.jornadas.filter((j) => j.fecha !== jornada.fecha);
    this.jornadas = [...resto, jornada].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /** Abre un tramo nuevo (fichar entrada o reanudar tras una pausa). */
  ficharEntrada(): Promise<void> {
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
      const actualizada: Jornada = { ...jornada, tramos: [...jornada.tramos, tramo] };
      await guardarJornada($state.snapshot(actualizada));
      this.aplicar($state.snapshot(actualizada));
      this.ahora = instante;
    });
  }

  /**
   * Cierra el tramo abierto. "Pausa" y "Fichar salida" cierran el mismo tramo:
   * la diferencia es solo lo que el usuario piensa hacer después, y la app no
   * necesita adivinarlo para medir bien el tiempo.
   */
  cerrarTramo(): Promise<void> {
    return this.encolar(async () => {
      const jornada = this.jornadaHoy;
      if (!jornada) return;

      // Se cierra el último tramo abierto por hora, no por orden de inserción.
      const abierto = tramosOrdenados(jornada)
        .filter((t) => t.fin === null)
        .at(-1);
      if (abierto === undefined) return;

      const instante = Math.max(Date.now(), abierto.inicio);
      const actualizada: Jornada = {
        ...jornada,
        tramos: jornada.tramos.map((t) => (t.id === abierto.id ? { ...t, fin: instante } : t)),
      };
      await guardarJornada($state.snapshot(actualizada));
      this.aplicar($state.snapshot(actualizada));
      this.ahora = instante;
    });
  }

  /** Guarda una jornada completa (alta o corrección manual). */
  guardar(jornada: Jornada): Promise<void> {
    return this.encolar(async () => {
      await guardarJornada($state.snapshot(jornada));
      this.aplicar($state.snapshot(jornada));
    });
  }

  eliminar(fecha: string): Promise<void> {
    return this.encolar(async () => {
      await borrarJornada(fecha);
      this.jornadas = this.jornadas.filter((j) => j.fecha !== fecha);
    });
  }

  /** Cambia uno o varios ajustes y los persiste. */
  actualizarAjustes(cambios: Partial<Ajustes>): Promise<void> {
    return this.encolar(async () => {
      const siguientes = { ...this.ajustes, ...cambios };
      await guardarAjustes($state.snapshot(siguientes));
      this.ajustes = $state.snapshot(siguientes);
    });
  }

  /** Restaura una copia ya validada, en una transacción, y recarga el estado. */
  importar(jornadas: Jornada[], ajustes: Ajustes | null): Promise<void> {
    return this.encolar(async () => {
      await importarCopia(
        $state.snapshot(jornadas),
        ajustes === null ? null : $state.snapshot(ajustes),
      );
      const recargado = await cargarTodo();
      this.jornadas = recargado.jornadas;
      this.ajustes = recargado.ajustes;
    });
  }
}

export const app = new EstadoApp();
