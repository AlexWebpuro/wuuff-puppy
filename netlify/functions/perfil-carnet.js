// Sirve una foto del carné de vacunas. Es PRIVADA: se abre con la clave del dueño (su enlace de edición)
// o con el permiso temporal que da el PIN del carné (el veterinario, al escanear la placa).
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

function claveValida(perfil, clave) {
  if (!perfil || typeof clave !== 'string' || clave.length !== perfil.clave.length) return false;
  return crypto.timingSafeEqual(Buffer.from(clave), Buffer.from(perfil.clave));
}
// Permiso temporal (30 min) que entrega perfil-carnet-pin cuando el PIN es correcto
function permisoValido(perfil, id, t) {
  const m = /^(\d{10,16})\.([a-f0-9]{64})$/.exec(String(t || ''));
  if (!perfil || !perfil.pinHash || !m || parseInt(m[1], 10) < Date.now()) return false;
  const firma = crypto.createHmac('sha256', perfil.clave).update(id + '.' + m[1]).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(m[2]));
}

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  const id = String(q.id || '').toUpperCase();
  const k = String(q.k || '');
  const noHay = { statusCode: 404, headers: { 'Cache-Control': 'no-store' }, body: 'No encontrada' };
  if (!/^[A-Z0-9]{6,16}$/.test(id) || !/^[a-z0-9]{6,30}$/.test(k)) return noHay;
  connectLambda(event);
  const store = getStore('perfiles-nfc');
  const perfil = await store.get(id, { type: 'json' });
  if (!claveValida(perfil, q.clave) && !permisoValido(perfil, id, q.t)) return noHay;
  if (!(perfil.carnet || []).some(function (x) { return x.k === k; })) return noHay;
  const r = await store.getWithMetadata('carnet-' + id + '-' + k, { type: 'arrayBuffer' });
  if (!r || !r.data) return noHay;
  return {
    statusCode: 200,
    headers: {
      'Content-Type': (r.metadata && r.metadata.tipo) || 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer'
    },
    isBase64Encoded: true,
    body: Buffer.from(r.data).toString('base64')
  };
};
