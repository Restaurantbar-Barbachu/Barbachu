import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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

  return {
    name: 'whatsapp-server-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        }
        next();
      });
      server.middlewares.use(handlePedir);
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/sw.js') {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        }
        next();
      });
      server.middlewares.use(handlePedir);
    },
  };
}

export default defineConfig({
  plugins: [react(), whatsappProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});
