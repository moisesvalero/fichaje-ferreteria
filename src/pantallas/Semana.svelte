<script lang="ts">
  import { estadoDeCifra, minutosJornada, minutosObjetivoDia, resumenSemana } from '../lib/calculo';
  import { claseChip, textoEstado } from '../lib/estados';
  import { app } from '../lib/estado.svelte';
  import { diaSemanaISO, diasEntre, fechasDeSemana, lunesDe, sumarDias } from '../lib/fechas';
  import {
    capitalizar,
    formatearFechaCorta,
    formatearMinutos,
    formatearRangoSemana,
    formatearSaldo,
  } from '../lib/formato';

  let { abrirEditor }: { abrirEditor: (fecha: string) => void } = $props();

  let desplazamiento = $state(0);

  const fechaRef = $derived(sumarDias(app.hoy, desplazamiento * 7));
  const resumen = $derived(resumenSemana(app.jornadas, app.ajustes, fechaRef, app.hoy, app.ahora));
  const dias = $derived(
    fechasDeSemana(lunesDe(fechaRef)).map((fecha) => {
      const jornada = app.jornadas.find((j) => j.fecha === fecha);
      const minutos = jornada ? minutosJornada(jornada, app.hoy, app.ahora) : 0;
      const tipo = jornada?.tipo ?? 'laborable';
      const laborable = app.ajustes.diasLaborables.includes(diaSemanaISO(fecha));
      const objetivo = minutosObjetivoDia(app.ajustes, fecha, tipo);

      // El estado del día sale del motor, no de un umbral escrito a mano aquí.
      const estado =
        tipo !== 'laborable'
          ? ('neutro' as const)
          : !laborable
            ? ('descanso' as const)
            : estadoDeCifra(minutos, objetivo, app.ajustes.margenAvisoMin);

      return { fecha, jornada, minutos, tipo, laborable, objetivo, estado };
    }),
  );

  const ETIQUETA_ESTADO: Record<string, string> = {
    bien: 'en objetivo',
    aviso: 'al límite',
    excedido: 'por encima del objetivo',
    descanso: 'descanso',
  };

  const porcentaje = $derived(
    resumen.minutosObjetivo > 0
      ? Math.min(100, (resumen.minutosTrabajados / resumen.minutosObjetivo) * 100)
      : 0,
  );

  const esSemanaActual = $derived(resumen.lunes === lunesDe(app.hoy));
</script>

<div class="navegador">
  <button
    class="boton-icono"
    type="button"
    aria-label="Semana anterior"
    onclick={() => (desplazamiento -= 1)}
  >
    ‹
  </button>
  <span class="numero">{formatearRangoSemana(resumen.lunes, sumarDias(resumen.lunes, 6))}</span>
  <button
    class="boton-icono"
    type="button"
    aria-label="Semana siguiente"
    disabled={esSemanaActual}
    onclick={() => (desplazamiento += 1)}
  >
    ›
  </button>
</div>

<section class="tarjeta tarjeta--heroe">
  <div class="fila-cabecera">
    <span class="etiqueta">Objetivo de la semana</span>
    <span class={claseChip(resumen.estado)}>{textoEstado(resumen.estado)}</span>
  </div>
  <p class="metrica numero">{formatearMinutos(resumen.minutosTrabajados)}</p>
  <p class="caption">de {formatearMinutos(resumen.minutosObjetivo)} objetivo</p>
  <div class="progreso">
    <div
      class="progreso__relleno"
      class:progreso__relleno--excedido={resumen.minutosExtra > 0}
      style="width: {porcentaje}%"
    ></div>
  </div>
  {#if resumen.minutosExtra > 0}
    <p class="caption exceso">
      Te has pasado {formatearMinutos(resumen.minutosExtra)}
      {resumen.cerrada ? '' : '(todavía puede cuadrar)'}
    </p>
  {/if}
</section>

<p class="caption nota">
  Objetivo ajustado a {resumen.diasComputables}
  {resumen.diasComputables === 1 ? 'día laborable' : 'días laborables'}
  {#if resumen.diasComputables !== app.ajustes.diasLaborables.length}
    (el resto son festivos, vacaciones o descanso)
  {/if}
</p>

<section class="tarjeta">
  <span class="etiqueta">Saldo acumulado</span>
  <p class="metrica numero saldo">{formatearSaldo(app.saldo.minutos)}</p>
  <p class="caption">
    Solo constancia: no se compensa ni se cobra. Suma
    {app.saldo.semanas}
    {app.saldo.semanas === 1 ? 'semana cerrada' : 'semanas cerradas'}.
  </p>
  {#if app.saldo.provisional > 0}
    <p class="caption provisional">
      Esta semana lleva {formatearSaldo(app.saldo.provisional)} de más, todavía provisional.
    </p>
  {/if}
</section>

<section class="seccion">
  <div class="fila-cabecera">
    <h2 class="etiqueta">Día a día</h2>
    <span class="caption numero">Total {formatearMinutos(resumen.minutosTrabajados)}</span>
  </div>

  <div class="tarjeta">
    <ul class="lista">
      {#each dias as dia (dia.fecha)}
        <li>
          <button
            class="fila fila--boton"
            type="button"
            onclick={() => abrirEditor(dia.fecha)}
            aria-label="Editar {formatearFechaCorta(dia.fecha)}: {formatearMinutos(
              dia.minutos,
            )}, {dia.tipo !== 'laborable' ? dia.tipo : ETIQUETA_ESTADO[dia.estado]}"
          >
            <span class="dia">
              <span class="punto punto--{dia.estado}" aria-hidden="true"></span>
              <span>{capitalizar(formatearFechaCorta(dia.fecha))}</span>
              {#if dia.tipo !== 'laborable'}
                <span class="chip chip--neutro">
                  {dia.tipo === 'festivo'
                    ? 'Festivo'
                    : dia.tipo === 'vacaciones'
                      ? 'Vacaciones'
                      : 'Baja'}
                </span>
              {:else if !dia.laborable}
                <span class="chip chip--neutro">Descanso</span>
              {:else}
                <span class="sr">{ETIQUETA_ESTADO[dia.estado]}</span>
              {/if}
            </span>
            <span class="fila__cifra numero">
              {#if dia.tipo === 'laborable' && !dia.laborable && dia.minutos === 0}
                —
              {:else}
                {formatearMinutos(dia.minutos)}
              {/if}
            </span>
          </button>
          {#if dia.objetivo > 0}
            <div class="barra">
              <div
                class="barra__relleno"
                class:barra__relleno--excedido={dia.estado === 'excedido'}
                style="width: {Math.min(100, (dia.minutos / dia.objetivo) * 100)}%"
              ></div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

{#if !resumen.cerrada}
  {@const restantes = diasEntre(app.hoy, sumarDias(resumen.lunes, 6)) + 1}
  <p class="caption nota">
    {restantes === 1 ? 'Falta 1 día' : `Faltan ${restantes} días`} para cerrar la semana. Hasta entonces
    el extra es provisional.
  </p>
{/if}

<style>
  .navegador {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0 12px;
  }

  .navegador > span {
    font-weight: 600;
  }

  .fila-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .fila-cabecera h2 {
    margin: 0;
  }

  .tarjeta--heroe .metrica {
    margin: 0;
  }

  .tarjeta--heroe .progreso {
    margin-top: 12px;
  }

  .exceso {
    margin: 8px 0 0;
    color: var(--rojo);
  }

  .nota {
    margin: 8px 0 0;
  }

  .saldo {
    margin: 4px 0 0;
    color: var(--azul);
  }

  .fila--boton {
    width: 100%;
    padding: 8px 0;
    border: 0;
    border-top: 1px solid var(--hairline);
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  li:first-child .fila--boton {
    border-top: 0;
  }

  .dia {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .punto {
    width: 8px;
    height: 8px;
    border-radius: var(--radio-pastilla);
    background: var(--verde);
    flex: 0 0 auto;
  }

  .punto--aviso {
    background: var(--ambar);
  }

  .punto--excedido {
    background: var(--rojo);
  }

  .punto--neutro,
  .punto--descanso {
    background: var(--tinta-apagada);
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .provisional {
    margin: 6px 0 0;
    color: var(--ambar);
  }

  .barra {
    height: 4px;
    margin: 0 0 8px;
    border-radius: var(--radio-pastilla);
    background: var(--superficie-hundida);
    overflow: hidden;
  }

  .barra__relleno {
    height: 100%;
    background: var(--azul);
  }

  .barra__relleno--excedido {
    background: var(--rojo);
  }

  .boton-icono {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--hairline);
    border-radius: var(--radio-pastilla);
    background: var(--superficie);
    color: var(--tinta-secundaria);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
  }

  .boton-icono:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .boton-icono:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }
</style>
