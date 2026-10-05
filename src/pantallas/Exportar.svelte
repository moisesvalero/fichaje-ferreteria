<script lang="ts">
  import { app } from '../lib/estado.svelte';
  import { capitalizar, formatearFechaLarga, formatearMinutos } from '../lib/formato';
  import {
    generarCSV,
    generarCopia,
    generarResumen,
    leerCopia,
    nombreArchivo,
    rangoMes,
    type ResumenExport,
  } from '../lib/exportar';

  type Rango = 'mes' | 'anterior' | 'todo';

  let rango = $state<Rango>('mes');
  let aviso = $state<string | null>(null);
  let entradaArchivo: HTMLInputElement | undefined = $state();

  const limites = $derived(
    rango === 'todo'
      ? { desde: '0000-01-01', hasta: '9999-12-31' }
      : rango === 'anterior'
        ? rangoMes(app.hoy, -1)
        : rangoMes(app.hoy),
  );

  const resumen = $derived<ResumenExport>(
    generarResumen(app.jornadas, app.ajustes, limites.desde, limites.hasta, app.hoy, app.ahora),
  );

  const etiquetaRango = $derived(
    rango === 'todo'
      ? 'Todo el historial'
      : `${capitalizar(formatearFechaLarga(limites.desde))} — ${capitalizar(formatearFechaLarga(limites.hasta))}`,
  );

  async function entregar(blob: Blob, nombre: string, titulo: string): Promise<void> {
    const archivo = new File([blob], nombre, { type: blob.type });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: titulo });
        return;
      } catch {
        // Si el usuario cancela el menú de compartir, no hay nada que hacer.
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    // Se revoca con margen: si se cancela justo después del click, Safari y Firefox
    // abortan la descarga antes de empezar.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // jsPDF arrastra html2canvas y pesa mucho: se carga solo al exportar, no al abrir la app.
  async function generarPDF(datos: ResumenExport): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margen = 16;
    const ancho = 210;
    let y = margen;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('Fichaje — Resumen personal de horas', margen, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generado el ${formatearFechaLarga(app.hoy)}`, margen, y);
    y += 10;

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(`Periodo: ${datos.desde} a ${datos.hasta}`, margen, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text(`Horas trabajadas: ${formatearMinutos(datos.minutosTotales)}`, margen, y);
    y += 6;
    doc.text(`Horas de más: ${formatearMinutos(datos.minutosExtra)}`, margen, y);
    y += 6;
    doc.text(`Días trabajados: ${datos.diasTrabajados}`, margen, y);
    y += 12;

    doc.setFontSize(12);
    doc.text('Desglose por día', margen, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const escribir = (texto: string, cifra: string) => {
      if (y > 275) {
        doc.addPage();
        y = margen;
      }
      doc.text(texto, margen, y);
      doc.text(cifra, ancho - margen, y, { align: 'right' });
      y += 6;
    };

    for (const semana of datos.semanas) {
      if (y > 265) {
        doc.addPage();
        y = margen;
      }
      doc.setFont('helvetica', 'bold');
      y += 3;
      escribir(
        `Semana ${semana.lunes} a ${semana.etiqueta.slice(-10)}`,
        formatearMinutos(semana.minutos),
      );
      doc.setFont('helvetica', 'normal');
    }

    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.text(
      'Resumen personal generado en el dispositivo. Sin datos de empresa.',
      margen,
      Math.min(y, 285),
    );

    return doc.output('blob');
  }

  async function compartirPDF(): Promise<void> {
    const nombre = nombreArchivo('fichaje-resumen', 'pdf', app.hoy);
    await entregar(await generarPDF(resumen), nombre, 'Resumen de fichaje');
    aviso = 'PDF listo para guardar o enviar.';
  }

  async function compartirCSV(): Promise<void> {
    const contenido = generarCSV(app.jornadas, limites.desde, limites.hasta, app.hoy, app.ahora);
    const nombre = nombreArchivo('fichaje-datos', 'csv', app.hoy);
    await entregar(
      new Blob([contenido], { type: 'text/csv;charset=utf-8' }),
      nombre,
      'Datos de fichaje',
    );
    aviso = 'CSV listo para abrir en una hoja de cálculo.';
  }

  async function exportarCopia(): Promise<void> {
    const contenido = generarCopia(
      $state.snapshot(app.jornadas),
      $state.snapshot(app.ajustes),
      Date.now(),
    );
    const nombre = nombreArchivo('fichaje-copia', 'json', app.hoy);
    await entregar(
      new Blob([contenido], { type: 'application/json' }),
      nombre,
      'Copia de seguridad',
    );
    app.marcarDescarga();
    aviso = 'Copia descargada.';
  }

  async function restaurarCopia(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;

    let texto: string;
    try {
      texto = await archivo.text();
    } catch {
      aviso = 'No se ha podido leer el archivo.';
      entrada.value = '';
      return;
    }
    entrada.value = '';

    const lectura = leerCopia(texto);
    if (!lectura.ok) {
      aviso = `Copia rechazada: ${lectura.error}`;
      return;
    }

    const escritas = await app.importar(lectura.copia.jornadas, lectura.copia.ajustes);
    if (escritas === 0) {
      // El detalle del fallo ya lo muestra el banner de error del shell.
      aviso = null;
      return;
    }

    const total = lectura.copia.jornadas.length;
    const resumenImportacion =
      escritas === total
        ? `Copia restaurada: ${escritas} ${escritas === 1 ? 'jornada' : 'jornadas'}.`
        : `Se han restaurado ${escritas} de ${total} jornadas. Vuelve a importar la copia para completar el resto.`;
    aviso = [resumenImportacion, ...lectura.copia.avisos].join(' ');
  }
</script>

<section class="seccion">
  <h2>Periodo</h2>
  <div class="segmentado" role="group" aria-label="Periodo a exportar">
    {#each [{ id: 'mes', etiqueta: 'Este mes' }, { id: 'anterior', etiqueta: 'Mes pasado' }, { id: 'todo', etiqueta: 'Todo' }] as opcion (opcion.id)}
      <button
        type="button"
        class:activo={rango === opcion.id}
        aria-pressed={rango === opcion.id}
        onclick={() => (rango = opcion.id as Rango)}
      >
        {opcion.etiqueta}
      </button>
    {/each}
  </div>
  <p class="caption resumen__periodo">{etiquetaRango}</p>
</section>

<section class="tarjeta">
  <span class="etiqueta">Lo que incluye el PDF</span>
  <div class="resumen">
    <div class="resumen__bloque">
      <span class="etiqueta">Total</span>
      <span class="resumen__cifra numero">{formatearMinutos(resumen.minutosTotales)}</span>
    </div>
    <div class="resumen__bloque">
      <span class="etiqueta">Extras</span>
      <span class="resumen__cifra numero">{formatearMinutos(resumen.minutosExtra)}</span>
    </div>
    <div class="resumen__bloque">
      <span class="etiqueta">Días</span>
      <span class="resumen__cifra numero">{resumen.diasTrabajados}</span>
    </div>
  </div>
  <p class="caption ayuda">Desglose por día y por semana. Sin datos de empresa.</p>
</section>

<div class="acciones">
  <button class="boton boton--primario" type="button" onclick={compartirPDF}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v12M8 7l4-4 4 4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
    Compartir PDF
  </button>
  <button class="boton boton--secundario" type="button" onclick={compartirCSV}>Compartir CSV</button
  >
</div>

{#if aviso}
  <div class="aviso aviso--info" role="status">{aviso}</div>
{/if}

<section class="seccion">
  <h2>Copia en un archivo</h2>
  <div class="tarjeta">
    <p class="caption ayuda">
      Tus horas ya están en tu cuenta. Esto descarga además un archivo con todo el historial y los
      ajustes, para llevártelo a otro sitio o guardarlo aparte.
    </p>
    <div class="acciones acciones--dos">
      <button class="boton boton--fantasma" type="button" onclick={exportarCopia}
        >Exportar JSON</button
      >
      <button class="boton boton--fantasma" type="button" onclick={() => entradaArchivo?.click()}>
        Importar JSON
      </button>
    </div>
    <p class="caption ayuda">
      {#if app.ultimaDescarga === null}
        Todavía no has descargado ninguna copia.
      {:else}
        Última descarga: {capitalizar(formatearFechaLarga(app.ultimaDescarga.slice(0, 10)))}
      {/if}
    </p>
    <input
      bind:this={entradaArchivo}
      type="file"
      accept="application/json,.json"
      class="oculto"
      onchange={restaurarCopia}
    />
  </div>
</section>

<style>
  .seccion h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--tinta-secundaria);
  }

  .segmentado {
    display: flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--hairline);
    border-radius: var(--radio);
    background: var(--superficie);
  }

  .segmentado button {
    flex: 1;
    min-height: 40px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: var(--tinta-secundaria);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .segmentado button.activo {
    background: var(--azul);
    color: #fff;
  }

  .segmentado button:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .resumen__periodo {
    margin: 8px 0 0;
  }

  .resumen {
    display: flex;
    margin-top: 12px;
  }

  .resumen__bloque {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 12px;
    border-left: 1px solid var(--hairline);
  }

  .resumen__bloque:first-child {
    padding-left: 0;
    border-left: 0;
  }

  .resumen__cifra {
    font-size: 20px;
    font-weight: 700;
  }

  .ayuda {
    margin: 8px 0 0;
  }

  .acciones {
    margin-top: 16px;
  }

  .acciones--dos {
    display: flex;
    gap: 8px;
  }

  .acciones--dos .boton + .boton {
    margin-top: 0;
  }

  .oculto {
    display: none;
  }
</style>
