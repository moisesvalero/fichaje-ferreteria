<script lang="ts">
  import { onMount } from 'svelte';

  import { actualizacion } from './lib/actualizacion.svelte';
  import { app } from './lib/estado.svelte';
  import { sesion } from './lib/sesion.svelte';
  import Acceso from './pantallas/Acceso.svelte';
  import Ajustes from './pantallas/Ajustes.svelte';
  import Editor from './pantallas/Editor.svelte';
  import Exportar from './pantallas/Exportar.svelte';
  import Historial from './pantallas/Historial.svelte';
  import Hoy from './pantallas/Hoy.svelte';
  import Semana from './pantallas/Semana.svelte';

  type Vista = 'hoy' | 'semana' | 'historial' | 'exportar' | 'ajustes';

  const PESTANAS: { id: Vista; etiqueta: string; icono: string[] }[] = [
    {
      id: 'hoy',
      etiqueta: 'Hoy',
      icono: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7.5v5l3.5 2'],
    },
    {
      id: 'semana',
      etiqueta: 'Semana',
      icono: ['M4 6h16v14H4z', 'M8 3v4M16 3v4M4 10h16'],
    },
    { id: 'historial', etiqueta: 'Historial', icono: ['M4 6h16M4 12h16M4 18h10'] },
    {
      id: 'exportar',
      etiqueta: 'Exportar',
      icono: ['M12 3v12', 'M8 7l4-4 4 4', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
    },
    {
      id: 'ajustes',
      etiqueta: 'Ajustes',
      icono: [
        'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
        'M12 3v2M12 19v2M4.2 7l1.7 1M18.1 16l1.7 1M4.2 17l1.7-1M18.1 8l1.7-1',
      ],
    },
  ];

  const TITULOS: Record<Vista, string> = {
    hoy: 'Fichaje',
    semana: 'Semana',
    historial: 'Historial',
    exportar: 'Exportar',
    ajustes: 'Ajustes',
  };

  let vista = $state<Vista>('hoy');
  let fechaEditor = $state<string | null>(null);

  onMount(() => {
    app.iniciarReloj();
    void sesion.comprobar();
    return () => app.detener();
  });

  // Al entrar se descarga el historial; al salir se vacía todo.
  $effect(() => {
    if (sesion.usuario === null) {
      app.olvidar();
      return;
    }
    void app.cargar();
  });

  function abrirEditor(fecha: string): void {
    fechaEditor = fecha;
  }

  function irA(destino: Vista): void {
    vista = destino;
  }
</script>

<div class="app">
  <header class="barra-superior">
    <div class="titulo-app">
      {#if vista === 'hoy'}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="var(--azul)" stroke-width="2" />
          <path
            d="M12 7v5l3.5 2"
            stroke="var(--azul)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {/if}
      <h1>{TITULOS[vista]}</h1>
    </div>

    {#if vista === 'hoy'}
      <button class="boton-icono" type="button" aria-label="Ajustes" onclick={() => irA('ajustes')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" />
          <path
            d="M12 3v2M12 19v2M4.2 7l1.7 1M18.1 16l1.7 1M4.2 17l1.7-1M18.1 8l1.7-1"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/if}
  </header>

  <main class="contenido">
    {#if actualizacion.disponible}
      <div class="aviso aviso--info aviso--descartable" role="status">
        <span>Hay una versión nueva lista.</span>
        <button
          type="button"
          onclick={() => void actualizacion.aplicar()}
          disabled={actualizacion.aplicando}
        >
          {actualizacion.aplicando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
    {/if}

    {#if app.error}
      <div class="aviso aviso--atencion aviso--descartable" role="alert">
        <span>{app.error}</span>
        <button type="button" aria-label="Descartar el aviso" onclick={() => (app.error = null)}>
          Cerrar
        </button>
      </div>
    {/if}

    {#if app.aviso}
      <div class="aviso aviso--info aviso--descartable" role="status">
        <span>{app.aviso}</span>
        <button type="button" aria-label="Descartar el aviso" onclick={() => (app.aviso = null)}>
          Cerrar
        </button>
      </div>
    {/if}

    {#if sesion.comprobando}
      <p class="caption">Comprobando la sesión…</p>
    {:else if sesion.usuario === null}
      <Acceso />
    {:else if !app.cargado}
      <p class="caption">Cargando tus datos…</p>
    {:else if vista === 'hoy'}
      <Hoy {abrirEditor} />
    {:else if vista === 'semana'}
      <Semana {abrirEditor} />
    {:else if vista === 'historial'}
      <Historial {abrirEditor} />
    {:else if vista === 'exportar'}
      <Exportar />
    {:else}
      <Ajustes />
    {/if}
  </main>

  {#if sesion.usuario !== null}
    <nav class="pestanas" aria-label="Navegación principal">
      {#each PESTANAS as pestana (pestana.id)}
        <button
          type="button"
          aria-current={vista === pestana.id ? 'page' : undefined}
          onclick={() => irA(pestana.id)}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {#each pestana.icono as d (d)}
              <path
                {d}
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            {/each}
          </svg>
          {pestana.etiqueta}
        </button>
      {/each}
    </nav>
  {/if}
</div>

{#if fechaEditor !== null}
  <Editor
    fecha={fechaEditor}
    oncerrar={() => {
      fechaEditor = null;
    }}
  />
{/if}

<style>
  .boton-icono {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-right: -8px;
    border: 0;
    border-radius: var(--radio-pastilla);
    background: none;
    color: var(--tinta-secundaria);
    cursor: pointer;
  }

  .boton-icono:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .aviso--descartable {
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .aviso--descartable button {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: rgb(255 255 255 / 60%);
    color: inherit;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .aviso--descartable button:focus-visible {
    outline: 2px solid currentcolor;
    outline-offset: 2px;
  }
</style>
