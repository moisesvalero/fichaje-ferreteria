import '@fontsource-variable/inter';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';

import './app.css';
import App from './App.svelte';
import { actualizacion } from './lib/actualizacion.svelte';

// El service worker mantiene la caché al día, pero no recarga la app por su
// cuenta: avisa, y el usuario actualiza cuando le venga bien.
const aplicarActualizacion = registerSW({
  immediate: true,
  onNeedRefresh() {
    actualizacion.marcarDisponible();
  },
});
actualizacion.registrar(aplicarActualizacion);

const app = mount(App, { target: document.getElementById('app')! });

export default app;
