<script lang="ts">
  import { configurado } from '../lib/appwrite';
  import { accesoFallido, sesion } from '../lib/sesion.svelte';

  const fallo = accesoFallido();
</script>

<div class="acceso">
  <div class="marca">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--azul)" stroke-width="1.8" />
      <path
        d="M12 7v5l3.5 2"
        stroke="var(--azul)"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
    <h1>Fichaje Ferretería</h1>
    <p class="caption">Controla tus 8 h al día y 40 h a la semana, ni más ni menos.</p>
  </div>

  {#if !configurado}
    <div class="aviso aviso--atencion" role="alert">
      Falta la configuración de Appwrite. Define <code>VITE_APPWRITE_ENDPOINT</code> y
      <code>VITE_APPWRITE_PROJECT</code> en el entorno y vuelve a construir la app.
    </div>
  {:else}
    <div class="tarjeta">
      <p class="caption">
        Tus horas se guardan en tu cuenta, así que no las pierdes si cambias de móvil. Nadie más
        puede verlas: cada registro pertenece solo a tu usuario.
      </p>

      <button
        class="boton boton--primario entrar"
        type="button"
        disabled={sesion.entrando}
        onclick={() => sesion.entrarConGoogle()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M21.35 11.1H12v2.8h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.99 5.99 0 0 1 0-12c1.7 0 2.84.72 3.5 1.34l2.38-2.3A9 9 0 1 0 12 21c5.2 0 8.63-3.65 8.63-8.8 0-.6-.07-1.05-.28-1.1Z"
          />
        </svg>
        {sesion.entrando ? 'Abriendo Google…' : 'Continuar con Google'}
      </button>

      {#if sesion.error}
        <p class="caption error" role="alert">{sesion.error}</p>
      {/if}
      {#if fallo}
        <p class="caption error" role="alert">
          Google no ha completado el acceso. Inténtalo otra vez.
        </p>
      {/if}
    </div>

    <p class="caption nota">
      Con la sesión iniciada, la app necesita conexión para leer y guardar. Es la contrapartida de
      tener los datos en la nube en lugar de solo en el móvil.
    </p>
  {/if}
</div>

<style>
  .acceso {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 24px;
    min-height: 70dvh;
    max-width: var(--ancho-maximo);
    margin: 0 auto;
    padding: var(--margen);
  }

  .marca {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .marca h1 {
    margin: 8px 0 0;
    font-size: 24px;
    letter-spacing: -0.01em;
  }

  .marca .caption {
    margin: 0;
    max-width: 28ch;
  }

  .entrar {
    margin-top: 16px;
  }

  .error {
    margin: 12px 0 0;
    color: var(--rojo);
  }

  .nota {
    margin: 0;
    text-align: center;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
</style>
