/** Tipos del dominio de fichaje. Todo el tiempo se guarda en milisegundos epoch (local). */

/** Clasificación de un día. Solo `laborable` cuenta para el objetivo semanal. */
export type TipoDia = 'laborable' | 'festivo' | 'vacaciones' | 'baja';

/**
 * Un tramo de trabajo continuo (por ejemplo, la mañana o la tarde).
 * `fin === null` significa que el tramo sigue abierto.
 */
export interface Tramo {
  id: string;
  inicio: number;
  fin: number | null;
}

/** Un día completo con sus tramos. `fecha` es 'YYYY-MM-DD' y actúa como clave. */
export interface Jornada {
  fecha: string;
  tramos: Tramo[];
  tipo: TipoDia;
  nota?: string;
  /** Marcado cuando el registro se ha tocado a mano. */
  corregido?: boolean;
}

/** Límites y preferencias, todos configurables. */
export interface Ajustes {
  /** Horas objetivo de un día laborable. Por defecto 8. */
  horasDia: number;
  /** Horas objetivo de una semana completa. Por defecto 40. */
  horasSemana: number;
  /** Minutos de margen antes de considerar que te has pasado. Por defecto 10. */
  margenAvisoMin: number;
  /** Días laborables en numeración ISO: 1 = lunes ... 7 = domingo. */
  diasLaborables: number[];
  /** Días sin copia de seguridad antes de recordártelo. */
  recordatorioCopiaDias: number;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  horasDia: 8,
  horasSemana: 40,
  margenAvisoMin: 10,
  diasLaborables: [1, 2, 3, 4, 5],
  recordatorioCopiaDias: 14,
};

/** Semáforo de una cifra clave. Nunca se muestra solo con color: siempre lleva texto. */
export type Estado = 'bien' | 'aviso' | 'excedido';

/** Resumen de una semana natural (lunes a domingo). */
export interface ResumenSemana {
  /** Lunes de la semana, 'YYYY-MM-DD'. */
  lunes: string;
  /** Las siete fechas de la semana, de lunes a domingo. */
  fechas: string[];
  /** Minutos trabajados en la semana. */
  minutosTrabajados: number;
  /** Minutos objetivo, ya ajustados a los días laborables no festivos. */
  minutosObjetivo: number;
  /** Minutos por encima del objetivo. Nunca negativo. */
  minutosExtra: number;
  /** Días que cuentan para el objetivo (laborables y no festivos). */
  diasComputables: number;
  /** `true` si la semana ya ha terminado respecto a la fecha de referencia. */
  cerrada: boolean;
  estado: Estado;
}
