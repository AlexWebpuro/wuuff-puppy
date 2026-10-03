// Sirve la foto de la mascota del perfil NFC: https://wuuffpuppy.co/m/<id>/foto
const { getStore, connectLambda } = require('@netlify/blobs');

exports.handler = async function (event) {
  connectLambda(event);
  const id = String((event.queryStringParameters || {}).id || '').toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(id)) return { statusCode: 404, body: 'No encontrada' };
  const store = getStore({ name: 'perfiles-nfc', consistency: 'strong' });
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
