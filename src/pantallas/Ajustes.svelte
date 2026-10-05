<script lang="ts">
  import { app } from '../lib/estado.svelte';
  import { diasEntre, aFecha } from '../lib/fechas';
  import { sesion } from '../lib/sesion.svelte';

  const DIAS = [
    { valor: 1, letra: 'L', nombre: 'lunes' },
    { valor: 2, letra: 'M', nombre: 'martes' },
    { valor: 3, letra: 'X', nombre: 'miércoles' },
    { valor: 4, letra: 'J', nombre: 'jueves' },
    { valor: 5, letra: 'V', nombre: 'viernes' },
    { valor: 6, letra: 'S', nombre: 'sábado' },
    { valor: 7, letra: 'D', nombre: 'domingo' },
  ];

  const diasSinCopia = $derived(
    app.ultimaDescarga === null ? null : diasEntre(aFecha(new Date(app.ultimaDescarga)), app.hoy),
  );

  const copiaAtrasada = $derived(
    diasSinCopia === null || diasSinCopia >= app.ajustes.recordatorioCopiaDias,
  );

  function alternarDia(valor: number): void {
    const actuales = app.ajustes.diasLaborables;
    const siguientes = actuales.includes(valor)
      ? actuales.filter((d) => d !== valor)
      : [...actuales, valor].sort((a, b) => a - b);
    if (siguientes.length === 0) return; // una semana sin días laborables no tiene sentido
    void app.actualizarAjustes({ diasLaborables: siguientes });
  }

  async function ajustarHoras(campo: 'horasDia' | 'horasSemana', delta: number): Promise<void> {
    const nuevo = Math.min(24, Math.max(1, app.ajustes[campo] + delta));
    await app.actualizarAjustes({ [campo]: nuevo });
  }

  async function ajustarMargen(delta: number): Promise<void> {
    const nuevo = Math.min(60, Math.max(0, app.ajustes.margenAvisoMin + delta * 5));
    await app.actualizarAjustes({ margenAvisoMin: nuevo });
  }
</script>

<section class="seccion">
  <h2>Límites</h2>
  <div class="tarjeta">
    <ul class="lista">
      <li class="fila">
        <span class="fila__principal">
          Horas al día
          <span class="caption ayuda">Jornada ordinaria base</span>
        </span>
        <span class="paso">
          <button
            type="button"
            aria-label="Menos horas al día"
            onclick={() => ajustarHoras('horasDia', -1)}>−</button
          >
          <span class="numero valor">{app.ajustes.horasDia}h</span>
          <button
            type="button"
            aria-label="Más horas al día"
            onclick={() => ajustarHoras('horasDia', 1)}>+</button
          >
        </span>
      </li>
      <li class="fila">
        <span class="fila__principal">
          Horas a la semana
          <span class="caption ayuda">Cómputo antes de contar extras</span>
        </span>
        <span class="paso">
          <button
            type="button"
            aria-label="Menos horas a la semana"
            onclick={() => ajustarHoras('horasSemana', -1)}>−</button
          >
          <span class="numero valor">{app.ajustes.horasSemana}h</span>
          <button
            type="button"
            aria-label="Más horas a la semana"
            onclick={() => ajustarHoras('horasSemana', 1)}>+</button
          >
        </span>
      </li>
      <li class="fila">
        <span class="fila__principal">
          Margen de aviso
          <span class="caption ayuda">Antes de avisarte de que te pasas</span>
        </span>
        <span class="paso">
          <button type="button" aria-label="Menos margen de aviso" onclick={() => ajustarMargen(-1)}
            >−</button
          >
          <span class="numero valor">{app.ajustes.margenAvisoMin} min</span>
          <button type="button" aria-label="Más margen de aviso" onclick={() => ajustarMargen(1)}
            >+</button
          >
        </span>
      </li>
    </ul>

    <p class="caption ayuda">
      {app.ajustes.horasDia}h al día × {app.ajustes.diasLaborables.length}
      {app.ajustes.diasLaborables.length === 1 ? 'día laborable' : 'días laborables'} =
      {app.ajustes.horasDia * app.ajustes.diasLaborables.length}h a la semana.
    </p>
    {#if app.ajustes.horasDia * app.ajustes.diasLaborables.length !== app.ajustes.horasSemana}
      <p class="caption desajuste">
        No cuadra con las {app.ajustes.horasSemana}h semanales que tienes puestas. El objetivo de la
        semana se calcula con las horas semanales, repartidas entre esos días.
      </p>
    {/if}
    <p class="caption ayuda">
      El objetivo de cada semana se congela al cerrarse, así que cambiar estos límites no reescribe
      el saldo que ya tenías apuntado.
    </p>
  </div>
</section>

<section class="seccion">
  <h2>Días laborables</h2>
  <div class="tarjeta">
    <div class="dias" role="group" aria-label="Días laborables">
      {#each DIAS as dia (dia.valor)}
        <button
          type="button"
          class="dia"
          class:dia--activo={app.ajustes.diasLaborables.includes(dia.valor)}
          aria-pressed={app.ajustes.diasLaborables.includes(dia.valor)}
          aria-label={dia.nombre}
          onclick={() => alternarDia(dia.valor)}
        >
          {dia.letra}
        </button>
      {/each}
    </div>
    <p class="caption ayuda">
      El objetivo semanal se ajusta a los días que trabajas. Marca un día como festivo o vacaciones
      desde el editor de la jornada y dejará de contar.
    </p>
  </div>
</section>

<section class="seccion">
  <h2>Cuenta</h2>
  <div class="tarjeta">
    <ul class="lista">
      <li class="fila">
        <span class="fila__principal">Sesión</span>
        <span class="fila__cifra">{sesion.usuario?.email ?? '—'}</span>
      </li>
    </ul>
    <p class="caption ayuda">
      Tus horas se guardan en tu cuenta, no en este móvil. Cerrar sesión no borra nada: puedes
      volver a entrar desde otro dispositivo.
    </p>
    <button
      class="boton boton--fantasma"
      type="button"
      onclick={() => {
        app.olvidar();
        void sesion.salir();
      }}
    >
      Cerrar sesión
    </button>
  </div>
</section>

<section class="seccion">
  <h2>Datos</h2>
  <div class="tarjeta">
    <ul class="lista">
      <li class="fila">
        <span class="fila__principal">Última descarga</span>
        <span class="fila__cifra">
          {#if diasSinCopia === null}
            Nunca
          {:else if diasSinCopia === 0}
            Hoy
          {:else if diasSinCopia === 1}
            Ayer
          {:else}
            Hace {diasSinCopia} días
          {/if}
        </span>
      </li>
    </ul>

    {#if copiaAtrasada}
      <div class="aviso aviso--atencion" role="status">
        {diasSinCopia === null
          ? 'Todavía no has descargado ninguna copia.'
          : 'Llevas mucho sin descargar una copia.'}
      </div>
    {/if}

    <p class="caption ayuda">
      La nube ya guarda tu historial. Descargar una copia de vez en cuando te sirve para tenerlo
      también en un archivo tuyo, en Exportar.
    </p>
  </div>
</section>

<section class="seccion">
  <h2>Acerca de</h2>
  <div class="tarjeta">
    <ul class="lista">
      <li class="fila">
        <span class="fila__principal">Versión</span>
        <span class="fila__cifra">0.1.0</span>
      </li>
      <li class="fila">
        <span class="fila__principal">Necesita conexión para fichar</span>
        <span class="chip chip--neutro">Sí</span>
      </li>
      <li class="fila">
        <span class="fila__principal">Dónde viven tus datos</span>
        <span class="fila__cifra">En tu cuenta</span>
      </li>
    </ul>
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

  .fila__principal {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ayuda {
    margin: 0;
  }

  .tarjeta > .ayuda {
    margin-top: 12px;
  }

  .desajuste {
    margin: 6px 0 0;
    color: var(--ambar);
  }

  .paso {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .paso button {
    width: 36px;
    height: 36px;
    border: 1px solid var(--hairline);
    border-radius: 10px;
    background: var(--superficie);
    color: var(--tinta-secundaria);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .paso button:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .valor {
    min-width: 62px;
    text-align: center;
    font-weight: 600;
  }

  .dias {
    display: flex;
    gap: 6px;
  }

  .dia {
    flex: 1;
    min-height: 44px;
    border: 1px solid var(--hairline);
    border-radius: 10px;
    background: var(--superficie);
    color: var(--tinta-secundaria);
    font-weight: 600;
    cursor: pointer;
  }

  .dia--activo {
    background: var(--azul);
    border-color: var(--azul);
    color: #fff;
  }

  .dia:focus-visible {
    outline: 2px solid var(--azul);
    outline-offset: 2px;
  }

  .aviso {
    margin-top: 12px;
  }
</style>
