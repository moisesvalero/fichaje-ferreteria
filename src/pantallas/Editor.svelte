<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import { minutosJornada, minutosObjetivoDia } from '../lib/calculo';
  import { app } from '../lib/estado.svelte';
  import {
    capitalizar,
    formatearFechaLarga,
    formatearHora,
    formatearMinutos,
  } from '../lib/formato';
  import { instanteLocal, partesDeHora } from '../lib/parseo';
  import type { Jornada, TipoDia } from '../lib/tipos';

  let { fecha, oncerrar }: { fecha: string; oncerrar: () => void } = $props();

  interface Fila {
    id: string;
    desde: string;
    hasta: string;
  }

  function aInstante(hora: string): number | null {
    return instanteLocal(fecha, hora);
  }

  const existente = app.jornadas.find((j) => j.fecha === fecha);

  let filas = $state<Fila[]>(
    (existente?.tramos ?? [])
      .slice()
      .sort((a, b) => a.inicio - b.inicio)
      .map((t) => ({
        id: t.id,
        desde: formatearHora(t.inicio),
        hasta: t.fin === null ? '' : formatearHora(t.fin),
      })),
  );
  let tipo = $state<TipoDia>(existente?.tipo ?? 'laborable');
  let nota = $state(existente?.nota ?? '');
  /** `true` en cuanto el usuario toca algo: hay cambios sin guardar. */
  let tocado = $state(false);
  let hoja: HTMLDivElement | undefined = $state();
  let focoAnterior: HTMLElement | null = null;

  interface FilaCalculada extends Fila {
    inicio: number | null;
    /** null significa tramo abierto; el vacío es intención, no un error. */
    fin: number | null;
    error: string | null;
  }

  const filasCalculadas = $derived<FilaCalculada[]>(
    filas.map((fila) => {
      const inicio = aInstante(fila.desde);
      const vacio = fila.hasta.trim() === '';
      const fin = vacio ? null : aInstante(fila.hasta);

      let error: string | null = null;
      if (inicio === null) {
        error = 'La hora de inicio no es válida.';
      } else if (!vacio && fin === null) {
        error = 'La hora de fin no es válida.';
      } else if (fin !== null && inicio !== null && fin < inicio) {
        error = 'La hora de fin es anterior a la de inicio.';
      }

      return { ...fila, inicio, fin, error };
    }),
  );

  const errores = $derived(filasCalculadas.filter((f) => f.error !== null));
  const porId = $derived(new Map(filasCalculadas.map((f) => [f.id, f])));

  const borrador = $derived<Jornada>({
    fecha,
    tipo,
    nota: nota.trim() === '' ? undefined : nota.trim(),
    corregido: true,
    tramos: filasCalculadas
      .filter((f): f is FilaCalculada & { inicio: number } => f.inicio !== null)
      .map((f) => ({ id: f.id, inicio: f.inicio, fin: f.fin }))
      .sort((a, b) => a.inicio - b.inicio),
  });

  // Se compara contra hoy: un tramo abierto de un día pasado no computa.
  const total = $derived(minutosJornada(borrador, app.hoy, app.ahora));
  const objetivo = $derived(minutosObjetivoDia(app.ajustes, fecha, tipo));
  const exceso = $derived(total - objetivo);

  /** Pares de tramos que se pisan: el motor los fusiona, pero hay que avisarlo. */
  const solapes = $derived(
    (() => {
      const validos = filasCalculadas
        .filter((f): f is FilaCalculada & { inicio: number } => f.inicio !== null)
        .map((f) => ({ inicio: f.inicio, fin: Math.max(f.inicio, f.fin ?? f.inicio) }))
        .sort((a, b) => a.inicio - b.inicio);

      let cuenta = 0;
      for (let i = 1; i < validos.length; i += 1) {
        const anterior = validos[i - 1];
        const actual = validos[i];
        if (anterior !== undefined && actual !== undefined && actual.inicio < anterior.fin) {
          cuenta += 1;
        }
      }
      return cuenta;
    })(),
  );

  const abiertoEnDiaPasado = $derived(
    fecha !== app.hoy && filasCalculadas.some((f) => f.fin === null && f.error === null),
  );

  const puedeGuardar = $derived(errores.length === 0);

  const TIPOS: { valor: TipoDia; etiqueta: string }[] = [
    { valor: 'laborable', etiqueta: 'Laborable' },
    { valor: 'festivo', etiqueta: 'Festivo' },
    { valor: 'vacaciones', etiqueta: 'Vacaciones' },
    { valor: 'baja', etiqueta: 'Baja' },
  ];

  function anadirTramo(): void {
    const ultimo = filas.at(-1);
    const desde = ultimo?.hasta !== undefined && ultimo.hasta !== '' ? ultimo.hasta : '09:00';
    const reloj = partesDeHora(desde) ?? { hora: 9, minuto: 0, segundo: 0 };
    const fin = `${String(Math.min(23, reloj.hora + 4)).padStart(2, '0')}:${String(reloj.minuto).padStart(2, '0')}`;
    tocado = true;
    filas = [...filas, { id: crypto.randomUUID(), desde, hasta: fin }];
  }

  function quitarTramo(id: string): void {
    tocado = true;
    filas = filas.filter((f) => f.id !== id);
  }

  async function guardar(): Promise<void> {
    await app.guardar(borrador);
    oncerrar();
  }

  async function eliminarDia(): Promise<void> {
    await app.eliminar(fecha);
    oncerrar();
  }

  const FOCALIZABLES =
    'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])';

  /** Devuelve los elementos con los que se puede tabular dentro de la hoja. */
  function focosables(): HTMLElement[] {
    if (hoja === undefined) return [];
    return [...hoja.querySelectorAll<HTMLElement>(FOCALIZABLES)].filter(
      (elemento) => elemento.offsetParent !== null,
    );
  }

  function alPulsarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      oncerrar();
      return;
    }
    if (evento.key !== 'Tab') return;

    // Trampa de foco: sin esto se tabula fuera del diálogo y se navega por la
    // pantalla que hay detrás, que está oculta.
    const elementos = focosables();
    if (elementos.length === 0) return;

    const primero = elementos[0]!;
    const ultimo = elementos[elementos.length - 1]!;
    const activo = document.activeElement;

    if (evento.shiftKey && (activo === primero || activo === hoja)) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  onMount(() => {
    focoAnterior = document.activeElement as HTMLElement | null;
    // Foco inicial en el primer campo, no en el botón de cerrar.
    const primero = hoja?.querySelector<HTMLElement>('input, button');
    primero?.focus();
  });

  onDestroy(() => {
    // Al cerrar se devuelve el foco a donde estaba.
    focoAnterior?.focus?.();
  });

  // Si hay cambios sin guardar, el navegador avisa antes de cerrar o recargar.
  $effect(() => {
    if (!tocado) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  });
</script>

<svelte:window onkeydown={alPulsarTecla} />

<div class="fondo">
  <div
    class="hoja"
    role="dialog"
    aria-modal="true"
    aria-labelledby="titulo-editor"
    bind:this={hoja}
  >
    <header class="hoja__cabecera">
      <button class="texto-boton" type="button" onclick={oncerrar}>Cancelar</button>
      <h2 id="titulo-editor">Editar jornada</h2>
      <button
        class="texto-boton texto-boton--fuerte"
        type="button"
        onclick={guardar}
        disabled={!puedeGuardar || app.guardando}
      >
        Guardar
      </button>
    </header>

    <div class="hoja__cuerpo">
      <div class="tarjeta">
        <span class="etiqueta">Fecha de registro</span>
        <p class="fecha">{capitalizar(formatearFechaLarga(fecha))}</p>
      </div>

      <section class="tarjeta">
        <div class="fila-cabecera">
          <h3 class="etiqueta">Tramos</h3>
          <span class="caption">Entrada y salida por turnos</span>
        </div>

        {#if filas.length === 0}
          <p class="caption">Este día no tiene tramos.</p>
        {/if}

        {#each filas as fila, indice (fila.id)}
          {@const calculada = porId.get(fila.id)}
          {@const error = calculada?.error ?? null}
          <div class="tramo">
            <label class="campo">
              <span class="sr">Inicio del tramo {indice + 1}</span>
              <input
                type="time"
                bind:value={fila.desde}
                oninput={() => (tocado = true)}
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : `error-${fila.id}`}
              />
            </label>
            <span class="guion" aria-hidden="true">—</span>
            <label class="campo">
              <span class="sr">Fin del tramo {indice + 1}</span>
              <input
                type="time"
                bind:value={fila.hasta}
                oninput={() => (tocado = true)}
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : `error-${fila.id}`}
              />
            </label>
            <button
              class="boton-icono"
              type="button"
              aria-label="Quitar el tramo {indice + 1}"
              onclick={() => quitarTramo(fila.id)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
          {#if error !== null}
            <p class="caption error-campo" id="error-{fila.id}" role="alert">{error}</p>
          {/if}
        {/each}

        <button class="boton boton--fantasma" type="button" onclick={anadirTramo}>
          + Añadir tramo
        </button>

        <div class="total">
          <span class="etiqueta">Total del día</span>
          <span class="metrica numero">{formatearMinutos(total)}</span>
        </div>
        {#if exceso > 0}
          <p class="caption exceso">Te has pasado {formatearMinutos(exceso)} del límite diario.</p>
        {/if}

        {#if errores.length > 0}
          <p class="caption error-bloque" role="alert">
            Revisa las horas marcadas: hay {errores.length}
            {errores.length === 1 ? 'tramo' : 'tramos'} que no se pueden guardar.
          </p>
        {/if}
        {#if solapes > 0}
          <p class="caption aviso-solape">
            Hay tramos que se solapan: se contarán una sola vez, porque el reloj no trabaja dos
            veces a la vez.
          </p>
        {/if}
        {#if abiertoEnDiaPasado}
          <p class="caption aviso-solape">
            Un tramo sin hora de fin en un día pasado queda como olvido y no computa. Ponle una hora
            de fin para que cuente.
          </p>
        {/if}
      </section>

      <section class="tarjeta">
        <h3 class="etiqueta">Tipo de día</h3>
        <div class="tipos" role="group" aria-label="Tipo de día">
          {#each TIPOS as opcion (opcion.valor)}
            <button
              type="button"
              class="tipo"
              class:tipo--activo={tipo === opcion.valor}
              aria-pressed={tipo === opcion.valor}
              onclick={() => {
                tocado = true;
                tipo = opcion.valor;
              }}
            >
              {opcion.etiqueta}
            </button>
          {/each}
        </div>
      </section>

      <section class="tarjeta">
        <label class="etiqueta" for="nota">Nota (opcional)</label>
        <input
          id="nota"
          class="entrada"
          type="text"
          bind:value={nota}
          placeholder="Inventario, reposición…"
        />
      </section>

      {#if existente}
        <div class="aviso aviso--info">
          <span>Este registro se guardará marcado como corregido a mano.</span>
        </div>
        <button class="boton boton--fantasma peligro" type="button" onclick={eliminarDia}>
          Borrar el día completo
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    background: rgb(15 23 42 / 40%);
  }

  .hoja {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: var(--ancho-maximo);
    height: 100dvh;
    background: var(--lienzo);
  }

  .hoja__cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 56px;
    padding: 0 var(--margen);
    padding-top: env(safe-area-inset-top);
    background: var(--superficie);
    border-bottom: 1px solid var(--hairline);
  }

  .hoja__cabecera h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }

  .texto-boton {
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--tinta-secundaria);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
  }

  .texto-boton--fuerte {
    color: var(--azul);
    font-weight: 600;
  }

  .texto-boton:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .hoja__cuerpo {
    flex: 1;
    overflow-y: auto;
    padding: var(--margen);
    padding-bottom: calc(32px + env(safe-area-inset-bottom));
  }

  .fecha {
    margin: 2px 0 0;
    font-size: 17px;
    font-weight: 600;
  }

  .fila-cabecera {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .fila-cabecera h3 {
    margin: 0;
  }

  .tramo {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .campo {
    flex: 1;
    min-width: 0;
  }

  .guion {
    color: var(--tinta-apagada);
  }

  input[type='time'],
  .entrada {
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--hairline);
    border-radius: var(--radio);
    background: var(--superficie);
    color: var(--tinta);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  input:focus {
    outline: 2px solid var(--azul);
    outline-offset: -1px;
  }

  .total {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
  }

  .exceso {
    margin: 6px 0 0;
    color: var(--ambar);
  }

  .error-campo {
    margin: -2px 0 8px;
    color: var(--rojo);
  }

  .error-bloque {
    margin: 8px 0 0;
    color: var(--rojo);
  }

  .aviso-solape {
    margin: 8px 0 0;
    color: var(--ambar);
  }

  .texto-boton:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .tipos {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-top: 12px;
  }

  .tipo {
    min-height: 44px;
    padding: 0 4px;
    border: 1px solid var(--hairline);
    border-radius: 10px;
    background: var(--superficie);
    color: var(--tinta-secundaria);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .tipo--activo {
    background: var(--azul);
    border-color: var(--azul);
    color: #fff;
  }

  .tipo:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .aviso {
    margin-top: 16px;
  }

  .peligro {
    margin-top: 8px;
    color: var(--rojo);
  }

  .boton-icono {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 1px solid var(--hairline);
    border-radius: var(--radio);
    background: var(--superficie);
    color: var(--tinta-apagada);
    cursor: pointer;
  }

  .boton-icono:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
