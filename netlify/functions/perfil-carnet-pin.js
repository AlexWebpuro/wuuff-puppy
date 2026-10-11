// Abre el carné de vacunas con el PIN que el dueño le dice al veterinario.
// POST { id, pin } → { ok, fotos: [urls temporales] }. Las URLs duran 30 minutos.
// Tras 5 intentos fallidos el carné se bloquea 15 minutos (para que no se adivine el PIN).
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const DURACION_MS = 30 * 60 * 1000;

function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) };
}
function hashPin(pin, sal) {
  return crypto.createHash('sha256').update(sal + ':' + pin).digest('hex');
}
function iguales(a, b) {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { error: 'JSON inválido' }); }
  const id = String(body.id || '').toUpperCase();
  const pin = String(body.pin || '').trim();
  if (!/^[A-Z0-9]{6,16}$/.test(id)) return json(404, { error: 'Perfil no encontrado' });

  connectLambda(event);
  const store = getStore('perfiles-nfc');
  const perfil = await store.get(id, { type: 'json' });
  if (!perfil || perfil.activo === false || !perfil.pinHash || !(perfil.carnet || []).length) {
    return json(404, { error: 'Este perfil no tiene carné disponible' });
  }

  const llave = 'intentos-' + id;
  const ahora = Date.now();
  let intentos = (await store.get(llave, { type: 'json' })) || { fallos: 0, hasta: 0 };
  if (intentos.hasta > ahora) {
    return json(429, { error: 'Demasiados intentos. Prueba de nuevo en ' + Math.ceil((intentos.hasta - ahora) / 60000) + ' minutos.' });
  }
  if (intentos.hasta && intentos.hasta <= ahora) intentos = { fallos: 0, hasta: 0 };

  if (!/^\d{4,6}$/.test(pin) || !iguales(hashPin(pin, perfil.pinSal), perfil.pinHash)) {
    intentos.fallos += 1;
    if (intentos.fallos >= MAX_FALLOS) intentos.hasta = ahora + BLOQUEO_MS;
    await store.setJSON(llave, intentos);
    const quedan = MAX_FALLOS - intentos.fallos;
    return json(401, { error: quedan > 0 ? 'PIN incorrecto. Te quedan ' + quedan + ' intentos.' : 'PIN incorrecto. El carné quedó bloqueado 15 minutos.' });
  }

  await store.delete(llave);
  const exp = ahora + DURACION_MS;
  const firma = crypto.createHmac('sha256', perfil.clave).update(id + '.' + exp).digest('hex');
  const t = exp + '.' + firma;
  const fotos = perfil.carnet.map(function (x) {
    return '/.netlify/functions/perfil-carnet?id=' + id + '&k=' + x.k + '&t=' + t;
  });
  return json(200, { ok: true, fotos: fotos, nombre: (perfil.mascota || {}).nombre || '' });
};
