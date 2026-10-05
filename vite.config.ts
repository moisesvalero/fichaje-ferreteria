import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg', 'icono-192.png', 'icono-512.png'],
      manifest: {
        name: 'Fichaje Ferretería',
        short_name: 'Fichaje',
        description: 'Control personal de tus horas de trabajo. Sin cuentas, sin nube.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F8FAFC',
        theme_color: '#2563EB',
        icons: [
          {
            src: 'icono-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icono-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // iOS y Android recortan el icono; el fondo va a sangre para que
            // no quede un borde transparente ni un cuadrado negro.
            src: 'icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Todo se sirve desde caché: la app tiene que abrir sin conexión.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
