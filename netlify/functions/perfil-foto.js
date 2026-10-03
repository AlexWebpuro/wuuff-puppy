// Sirve la foto de la mascota del perfil NFC: https://wuuffpuppy.co/m/<id>/foto
const { getStore, connectLambda } = require('@netlify/blobs');

// El código del perfil puede llegar como ?id=… (redirección de netlify.toml), en la ruta de la función
// (/.netlify/functions/perfil-ver/<código>) o en la dirección original que abrió el celular (/m/<código>).
function codigoPerfil(event) {
  const q = (event.queryStringParameters || {}).id;
  const fuentes = [q, event.path, event.rawUrl, (event.headers || {})['x-nf-original-path'], (event.headers || {})['x-original-uri']];
  for (const f of fuentes) {
    if (!f) continue;
    const m = /(?:^|\/m\/|perfil-(?:ver|foto)\/)([A-Za-z0-9]{6,16})(?:\/foto)?\/?(?:[?#]|$)/.exec(String(f));
    if (m) return m[1].toUpperCase();
  }
  return '';
}


exports.handler = async function (event) {
  connectLambda(event);
  const id = codigoPerfil(event);
  if (!/^[A-Z0-9]{6,16}$/.test(id)) return { statusCode: 404, body: 'No encontrada' };
  const store = getStore('perfiles-nfc');
  const r = await store.getWithMetadata('foto-' + id, { type: 'arrayBuffer' });
  if (!r || !r.data) return { statusCode: 404, body: 'No encontrada' };
  return {
    statusCode: 200,
    headers: {
      'Content-Type': (r.metadata && r.metadata.tipo) || 'image/jpeg',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex'
    },
    isBase64Encoded: true,
    body: Buffer.from(r.data).toString('base64')
  };
};
