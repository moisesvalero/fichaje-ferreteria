<script lang="ts">
  import { minutosJornada, resumenSemana } from '../lib/calculo';
  import { app } from '../lib/estado.svelte';
  import { lunesDe, sumarDias } from '../lib/fechas';
  import {
    capitalizar,
    formatearFechaCorta,
    formatearMinutos,
    formatearRangoSemana,
  } from '../lib/formato';
  import type { TipoDia } from '../lib/tipos';
  import { partesDeFecha } from '../lib/parseo';

  let { abrirEditor }: { abrirEditor: (fecha: string) => void } = $props();

  let desplazamientoMes = $state(0);

  const mesRef = $derived(
    (() => {
      const partes = partesDeFecha(app.hoy);
      if (partes === null) return new Date();
      return new Date(partes.anio, partes.mes - 1 + desplazamientoMes, 1, 12);
    })(),
  );

  const prefijo = $derived(
    `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, '0')}`,
  );

  const nombreMes = $derived(
    capitalizar(
      new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(mesRef),
    ),
  );

  const jornadasMes = $derived(app.jornadas.filter((j) => j.fecha.startsWith(prefijo)));

  const totalMes = $derived(
    jornadasMes.reduce((total, j) => total + minutosJornada(j, app.hoy, app.ahora), 0),
  );

  const diasTrabajados = $derived(
    jornadasMes.filter((j) => minutosJornada(j, app.hoy, app.ahora) > 0).length,
  );

  const extraMes = $derived(
    [...new Set(jornadasMes.map((j) => lunesDe(j.fecha)))]
      .map((lunes) => resumenSemana(app.jornadas, app.ajustes, lunes, app.hoy, app.ahora))
      .filter((r) => r.cerrada)
      .reduce((total, r) => total + r.minutosExtra, 0),
  );

  const grupos = $derived(
    (() => {
      const mapa = new Map<string, typeof jornadasMes>();
      for (const jornada of jornadasMes) {
        const lunes = lunesDe(jornada.fecha);
        const lista = mapa.get(lunes) ?? [];
        lista.push(jornada);
        mapa.set(lunes, lista);
      }
      return [...mapa.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([lunes, jornadas]) => ({
          lunes,
          etiqueta: formatearRangoSemana(lunes, sumarDias(lunes, 6)),
          total: jornadas.reduce((t, j) => t + minutosJornada(j, app.hoy, app.ahora), 0),
          jornadas: [...jornadas].sort((a, b) => b.fecha.localeCompare(a.fecha)),
        }));
    })(),
  );

  const NOMBRE_TIPO: Record<TipoDia, string> = {
    laborable: '',
    festivo: 'Festivo',
    vacaciones: 'Vacaciones',
    baja: 'Baja',
  };
</script>

<div class="navegador">
  <button
    class="boton-icono"
    type="button"
    aria-label="Mes anterior"
    onclick={() => (desplazamientoMes -= 1)}
  >
    ‹
  </button>
  <span class="mes">{nombreMes}</span>
  <button
    class="boton-icono"
    type="button"
    aria-label="Mes siguiente"
    disabled={desplazamientoMes >= 0}
    onclick={() => (desplazamientoMes += 1)}
  >
    ›
  </button>
</div>

<section class="tarjeta resumen">
  <div class="resumen__bloque">
    <span class="etiqueta">Total</span>
    <span class="resumen__cifra numero">{formatearMinutos(totalMes)}</span>
  </div>
  <div class="resumen__bloque">
    <span class="etiqueta">Extras</span>
    <span class="resumen__cifra numero exceso"
      >{extraMes > 0 ? `+${formatearMinutos(extraMes)}` : '—'}</span
    >
  </div>
  <div class="resumen__bloque">
    <span class="etiqueta">Días</span>
    <span class="resumen__cifra numero">{diasTrabajados}</span>
  </div>
</section>

{#if grupos.length === 0}
  <p class="caption">No hay registros en {nombreMes.toLowerCase()}.</p>
{:else}
  {#each grupos as grupo (grupo.lunes)}
    <section class="seccion">
      <div class="fila-cabecera">
        <h2 class="etiqueta">Semana {grupo.etiqueta}</h2>
        <span class="caption numero">{formatearMinutos(grupo.total)}</span>
      </div>
      <div class="tarjeta">
        <ul class="lista">
          {#each grupo.jornadas as jornada (jornada.fecha)}
            <li>
              <button
                class="fila fila--boton"
                type="button"
                onclick={() => abrirEditor(jornada.fecha)}
              >
                <span class="dia">
                  <span>{capitalizar(formatearFechaCorta(jornada.fecha))}</span>
                  {#if jornada.tipo !== 'laborable'}
                    <span class="chip chip--neutro">{NOMBRE_TIPO[jornada.tipo]}</span>
                  {/if}
                  {#if jornada.corregido}
                    <span class="chip chip--aviso">Corregido</span>
                  {/if}
                </span>
                <span class="derecha">
                  <span class="fila__cifra numero">
                    {formatearMinutos(minutosJornada(jornada, app.hoy, app.ahora))}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M9 6l6 6-6 6"
                      stroke="var(--tinta-apagada)"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/each}
{/if}

<style>
  .navegador {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0 12px;
  }

  .mes {
    font-weight: 600;
  }

  .resumen {
    display: flex;
    align-items: stretch;
  }

  .resumen__bloque {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 12px;
    border-left: 1px solid var(--hairline);
  }

  .resumen__bloque:first-child {
    padding-left: 0;
    border-left: 0;
  }

  .resumen__bloque:last-child {
    padding-right: 0;
  }

  .resumen__cifra {
    font-size: 18px;
    font-weight: 700;
  }

  .exceso {
    color: var(--tinta);
  }

  .seccion h2 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--tinta-secundaria);
  }

  .fila-cabecera {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }

  .fila--boton {
    width: 100%;
    padding: 10px 0;
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
    gap: 6px;
    min-width: 0;
  }

  .derecha {
    display: flex;
    align-items: center;
    gap: 6px;
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
