// Foto de una reseña: pública cuando la reseña está aprobada; con ?clave= la ve Angie antes de aprobarla
const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  const id = String(q.id || '');
  if (!/^[a-z0-9]{8,24}$/.test(id)) return { statusCode: 404, body: 'No encontrada' };
  connectLambda(event);
  const store = getStore('resenas');
  const r = await store.get('r-' + id, { type: 'json' });
  const conClave = !!(r && q.clave && q.clave === r.clave);
  if (!r || !r.foto || (r.estado !== 'aprobada' && !conClave)) return { statusCode: 404, body: 'No encontrada' };
  const f = await store.get('foto-' + id, { type: 'arrayBuffer' });
  if (!f) return { statusCode: 404, body: 'No encontrada' };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': conClave ? 'private, no-store' : 'public, max-age=86400' },
    isBase64Encoded: true,
    body: Buffer.from(f).toString('base64')
  };
};
