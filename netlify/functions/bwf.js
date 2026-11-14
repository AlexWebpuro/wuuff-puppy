// Black Wuuff Friday (/blackfriday/): estado de las 10 cajas y apartar una.
//   GET                          → { estado, total, vendidas, quedan, apartadas, siguiente, inicio, fin, ahora, … }
//   GET ?ref=WP-…                → { n, pagada, regalo }   (al volver del pago: qué caja le tocó)
//   POST { accion: 'apartar', token? }   → { n, token, hasta, regalo }  (10 minutos)
//   POST { accion: 'soltar', n, token }  → { ok }
// Las reglas están en netlify/lib/bwf.js.
const { getStore, connectLambda } = require('@netlify/blobs');
const B = require('../lib/bwf');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  let store;
  try { connectLambda(event); store = getStore(B.STORE); }
  catch (err) { console.error('Blobs no disponible', err.message); return json(503, { error: 'Intenta de nuevo en un momento' }); }

  if (event.httpMethod === 'GET') {
    const ref = String((event.queryStringParameters || {}).ref || '');
    if (ref) {
      if (!/^[A-Za-z0-9_-]{6,60}$/.test(ref)) return json(400, { error: 'Referencia no válida' });
      const r = await B.cajaDeRef(store, getStore('pedidos-wompi'), ref);
      return r ? json(200, r) : json(404, { error: 'No encontramos esa compra' });
    }
    return json(200, B.resumen(await B.leerCajas(store), Date.now()));
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { error: 'JSON inválido' }); }

  if (b.accion === 'apartar') {
    const r = await B.apartar(store, b.token);
    return json(r.error ? 409 : 200, r);
  }
  if (b.accion === 'soltar') {
    return json(200, { ok: await B.soltar(store, parseInt(b.n, 10), String(b.token || '')) });
  }
  return json(400, { error: 'Acción no válida' });
};
