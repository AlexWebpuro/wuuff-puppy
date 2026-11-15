// Función v2 del panel de pedidos (/.netlify/functions/panel-pedidos). La lógica está en netlify/lib/panel-api.js.
// Es v2 para que Netlify Blobs lea al instante: así lo recién guardado en el inventario se ve enseguida.
import api from '../lib/panel-api.js';

export default async (req, context) => {
  const url = new URL(req.url);
  const headers = Object.fromEntries(req.headers);
  if (context && context.ip) headers['x-nf-client-connection-ip'] = context.ip;
  const r = await api.handler({
    httpMethod: req.method, headers, isBase64Encoded: false,
    body: req.method === 'POST' ? await req.text() : '',
    queryStringParameters: Object.fromEntries(url.searchParams)
  });
  return new Response(r.body, { status: r.statusCode, headers: r.headers });
};
