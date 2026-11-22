// /api/pedir — redirige a WhatsApp sin exponer el número en el HTML ni en el repo.
// El número vive en la variable de entorno WA_NUMBER (Vercel → Settings → Environment Variables).
export default function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.statusCode = 405;
      return res.end('Método no permitido');
    }

    const number = String(process.env.WA_NUMBER || '').replace(/\D/g, '');
    if (number.length < 10 || number.length > 15) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('Pedidos por WhatsApp no disponibles por el momento.');
    }

    const url = new URL(req.url, 'https://barbachu.local');
    let text = url.searchParams.get('t') || 'Hola, quiero hacer un pedido';
    text = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
    if (!text) text = 'Hola, quiero hacer un pedido';

    res.statusCode = 302;
    res.setHeader('Location', 'https://wa.me/' + number + '?text=' + encodeURIComponent(text));
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.end();
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.end('Error al abrir WhatsApp.');
  }
}
