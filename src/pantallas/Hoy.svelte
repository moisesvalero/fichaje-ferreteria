<script lang="ts">
  import { claseChip, textoEstado } from '../lib/estados';
  import { app } from '../lib/estado.svelte';
  import { minutosTramo, tramosOrdenados } from '../lib/calculo';
  import {
    capitalizar,
    formatearFechaLarga,
    formatearHora,
    formatearMinutos,
  } from '../lib/formato';

  let { abrirEditor }: { abrirEditor: (fecha: string) => void } = $props();

  const abierto = $derived(
    app.jornadaHoy ? (tramosOrdenados(app.jornadaHoy).at(-1) ?? null) : null,
  );

  const etiquetaEstado = $derived(
    app.situacion === 'trabajando' && abierto
      ? `Trabajando desde las ${formatearHora(abierto.inicio)}`
      : app.situacion === 'en-pausa'
        ? 'En pausa'
        : 'Sin fichar',
  );

  const porcentaje = $derived(
    app.semana.minutosObjetivo > 0
      ? Math.min(100, (app.semana.minutosTrabajados / app.semana.minutosObjetivo) * 100)
      : 0,
  );

  const pendiente = $derived(app.pendientes[0] ?? null);
</script>

{#if pendiente}
  <div class="aviso aviso--atencion" role="status">
    <span>
      Sesión sin cerrar del {formatearFechaLarga(pendiente.jornada.fecha).replace(/^(\w)/, (m) =>
        m.toLowerCase(),
      )}
    </span>
    <button
      class="boton boton--fantasma aviso__accion"
      type="button"
      onclick={() => abrirEditor(pendiente.jornada.fecha)}
    >
      Definir hora
    </button>
  </div>
{/if}

<section class="tarjeta tarjeta--estado">
  <span class="etiqueta">{etiquetaEstado}</span>
  <p class="display numero">{formatearMinutos(app.dia.minutos)}</p>
  <p class="caption">
    {capitalizar(formatearFechaLarga(app.hoy))}
    {#if app.dia.objetivo > 0}
      · objetivo {formatearMinutos(app.dia.objetivo)}
    {/if}
  </p>
</section>

<div class="acciones">
  {#if app.situacion === 'trabajando'}
    <button
      class="boton boton--primario"
      type="button"
      disabled={app.guardando}
      onclick={() => void app.cerrarTramo()}
    >
      Fichar salida
    </button>
    <button
      class="boton boton--secundario"
      type="button"
      disabled={app.guardando}
      onclick={() => void app.cerrarTramo()}
    >
      Pausa
    </button>
  {:else if app.situacion === 'en-pausa'}
    <button
      class="boton boton--primario"
      type="button"
      disabled={app.guardando}
      onclick={() => void app.ficharEntrada()}
    >
      Reanudar
    </button>
  {:else}
    <button
      class="boton boton--primario"
      type="button"
      disabled={app.guardando}
      onclick={() => void app.ficharEntrada()}
    >
      Fichar entrada
    </button>
  {/if}
</div>

<section class="tarjeta">
  <div class="fila-cabecera">
    <h2 class="etiqueta">Semana</h2>
    <span class={claseChip(app.semana.estado)}>{textoEstado(app.semana.estado)}</span>
  </div>
  <div class="progreso" role="presentation">
    <div
      class="progreso__relleno"
      class:progreso__relleno--excedido={app.semana.minutosExtra > 0}
      style="width: {porcentaje}%"
    ></div>
  </div>
  <p class="semana-cifra">
    <span class="numero cifra-fuerte">{formatearMinutos(app.semana.minutosTrabajados)}</span>
    <span class="caption">de {formatearMinutos(app.semana.minutosObjetivo)} objetivo</span>
  </p>
  {#if app.semana.diasComputables !== app.ajustes.diasLaborables.length}
    <p class="caption">Objetivo ajustado a {app.semana.diasComputables} días laborables</p>
  {/if}
</section>

<section class="seccion">
  <div class="fila-cabecera">
    <h2 class="etiqueta">Tramos de hoy</h2>
    <span class="caption">
      {app.jornadaHoy?.tramos.length ?? 0}
      {(app.jornadaHoy?.tramos.length ?? 0) === 1 ? 'registro' : 'registros'}
    </span>
  </div>

  {#if app.jornadaHoy && app.jornadaHoy.tramos.length > 0}
    <div class="tarjeta">
      <ul class="lista">
        {#each tramosOrdenados(app.jornadaHoy) as tramo (tramo.id)}
          <li class="fila">
            <span class="fila__principal numero">
              {formatearHora(tramo.inicio)} – {tramo.fin === null
                ? 'en curso'
                : formatearHora(tramo.fin)}
            </span>
            <span class="fila__derecha">
              <span class="fila__cifra numero">
                {formatearMinutos(minutosTramo(tramo, app.ahora))}
              </span>
              <button
                class="boton-icono"
                type="button"
                aria-label="Editar el tramo de las {formatearHora(tramo.inicio)}"
                onclick={() => abrirEditor(app.hoy)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 20h4l10-10-4-4L4 16v4Z"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <p class="caption">Todavía no has fichado hoy.</p>
  {/if}

  <button class="boton boton--fantasma" type="button" onclick={() => abrirEditor(app.hoy)}>
    Añadir o corregir a mano
  </button>
</section>

<style>
  .tarjeta--estado {
    padding: 24px 16px;
    text-align: center;
  }

  .tarjeta--estado .etiqueta {
    color: var(--azul);
  }

  .tarjeta--estado .display {
    margin: 8px 0 4px;
  }

  .tarjeta--estado .caption {
    margin: 0;
  }

  .acciones {
    margin-top: 16px;
  }

  .fila-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .fila-cabecera h2 {
    margin: 0;
  }

  .semana-cifra {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 10px 0 0;
  }

  .cifra-fuerte {
    font-size: 20px;
    font-weight: 600;
  }

  .semana-cifra .caption {
    margin: 0;
  }

  .seccion {
    margin-top: 24px;
  }

  .fila__derecha {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .aviso {
    margin-bottom: 16px;
    justify-content: space-between;
  }

  .aviso__accion {
    width: auto;
    min-height: 36px;
    padding: 0 12px;
    background: var(--superficie);
    border-color: #fcd34d;
    color: #78350f;
    flex: 0 0 auto;
  }

  .boton-icono {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: var(--radio-pastilla);
    background: none;
    color: var(--tinta-apagada);
    cursor: pointer;
  }

  .boton-icono:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }
</style>
