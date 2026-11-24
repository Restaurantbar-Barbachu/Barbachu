import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

function whatsappProxyPlugin(): Plugin {
  const handlePedir = (
    req: { method?: string; url?: string },
    res: {
      statusCode: number;
      setHeader: (name: string, value: string) => void;
      end: (body?: string) => void;
    },
    next: () => void
  ) => {
    if (!req.url || !req.url.startsWith('/api/pedir')) {
      return next();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.statusCode = 405;
      return res.end('Método no permitido');
    }

    const number = String(process.env.WA_NUMBER || '').replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.end('Pedidos por WhatsApp disponibles al configurar WA_NUMBER en el servidor.');
    }

    const url = new URL(req.url, 'https://barbachu.local');
    let text = url.searchParams.get('t') || 'Hola, quiero hacer un pedido';
    text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
    if (!text) text = 'Hola, quiero hacer un pedido';

    res.statusCode = 302;
    res.setHeader('Location', `https://wa.me/${number}?text=${encodeURIComponent(text)}`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.end();
  };

  const attachMiddlewares = (server: {
    middlewares: {
      use: (
        fn: (
          req: { method?: string; url?: string },
          res: {
            statusCode: number;
            setHeader: (name: string, value: string) => void;
            end: (body?: string) => void;
          },
          next: () => void
        ) => void
      ) => void;
    };
  }) => {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.split('?')[0] === '/sw.js') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Service-Worker-Allowed', '/');
      }
      next();
    });
    server.middlewares.use(handlePedir);
  };

  return {
    name: 'whatsapp-server-redirect',
    configureServer: attachMiddlewares,
    configurePreviewServer: attachMiddlewares,
  };
}

export default defineConfig({
  plugins: [
    react(),
    whatsappProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
      manifest: {
        id: '/',
        name: 'Barbachu Restaurante Bar & POS',
        short_name: 'Barbachu',
        description: 'Menú digital y punto de venta para Barbachu Restaurante Bar con modo offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        lang: 'es-MX',
        categories: ['food', 'business', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
