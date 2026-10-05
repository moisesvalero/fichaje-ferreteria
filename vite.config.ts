import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // En desarrollo las llamadas salen por el mismo camino que en producción, para
  // que la cookie de sesión sea de primera parte también aquí.
  server: {
    proxy: {
      '/appwrite': {
        target: 'https://fra.cloud.appwrite.io',
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/appwrite/, '/v1'),
        // Mismo arreglo que en producción (api/appwrite): Appwrite marca la cookie
        // con su dominio y el navegador la rechazaría para el nuestro.
        configure: (proxy) => {
          // El tipo que expone Vite para el proxy no declara `on`, así que se
          // describe aquí lo mínimo que se usa.
          const servidor = proxy as unknown as {
            on: (
              evento: 'proxyRes',
              manejador: (respuesta: {
                headers: Record<string, string | string[] | undefined>;
              }) => void,
            ) => void;
          };
          servidor.on('proxyRes', (respuesta) => {
            const galletas = respuesta.headers['set-cookie'];
            if (typeof galletas === 'string') {
              respuesta.headers['set-cookie'] = galletas.replace(/;\s*domain=[^;]*/gi, '');
            } else if (Array.isArray(galletas)) {
              respuesta.headers['set-cookie'] = galletas.map((galleta) =>
                galleta.replace(/;\s*domain=[^;]*/gi, ''),
              );
            }
          });
        },
      },
    },
  },
  plugins: [
    svelte(),
    VitePWA({
      // 'prompt' y no 'autoUpdate': con autoUpdate el service worker recarga la
      // página por su cuenta y se llevaría por delante una corrección a medias
      // en el editor. Ahora avisa y actualiza cuando el usuario lo pide.
      registerType: 'prompt',
      includeAssets: [
        'icono.svg',
        'icono-180.png',
        'icono-192.png',
        'icono-512.png',
        'icono-maskable-512.png',
        'splash/*.png',
      ],
      manifest: {
        name: 'Jornada',
        short_name: 'Jornada',
        description:
          'Controla tus 8 horas al día y 40 a la semana, ni más ni menos. Con tu cuenta, para que perder el móvil no sea perder el historial.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F8FAFC',
        theme_color: '#2563EB',
        categories: ['productivity', 'utilities'],
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
            // iOS y Android recortan el icono según su propia forma, así que el
            // fondo va a sangre: si no, quedaría un borde transparente o negro.
            src: 'icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Todo se sirve desde caché: la app tiene que abrir sin conexión, y eso
        // incluye la tipografía y las pantallas de arranque de iOS.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
