// Función v2 del Black Wuuff Friday (/.netlify/functions/bwf). La lógica está en netlify/lib/bwf-api.js.
// Es v2 para que Netlify Blobs lea al instante: así dos personas no apartan la misma caja.
import api from '../lib/bwf-api.js';

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
