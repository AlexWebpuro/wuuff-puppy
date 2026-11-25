// Resumen del pedido para el pago (no guarda nada): mismas reglas que wompi-signature y pedido-contraentrega.
// POST { carrito, ciudad, metodo: 'wompi' | 'contraentrega', codigo, regalo }
//   → { ok, lineas: [{ nombre, cents, tipo, regalo }], subtotalCents, envioCents, descuentoCents, regaloCents, totalCents, contraentrega, promo }
// Si el código regala una placa y aún no escribieron sus datos, se cotiza igual (la placa de regalo vale $0).
const { getStore, connectLambda } = require('@netlify/blobs');
const tienda = require('../lib/tienda');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método no permitido' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { ok: false, error: 'JSON inválido' }); }
  let usados = null;
  try { connectLambda(event); usados = getStore('codigos-usados'); } catch (err) { /* sin Blobs: no se revisa si el código ya se usó */ }
  const opciones = { ahora: tienda.ahoraDe(event, b.simular), usado: async (c) => !!(usados && await usados.get(c)) };
  const datos = { carrito: b.carrito, ciudad: String(b.ciudad || '').slice(0, 80), codigo: b.codigo, regalo: b.regalo, metodo: b.metodo === 'contraentrega' ? 'contraentrega' : 'wompi' };
  let calc = await tienda.calcular(datos, opciones);
  if (!calc.ok && calc.faltaRegalo) calc = await tienda.calcular(Object.assign({}, datos, { regalo: { nombre: 'Regalo', forma: 'Huella', color: 'Morado' } }), opciones);
  if (!calc.ok) return json(400, { ok: false, error: calc.error, codigoInvalido: !!calc.codigoInvalido });
  return json(200, {
    ok: true,
    lineas: calc.lineas.map(l => ({ nombre: l.nombre, cents: l.cents, tipo: l.tipo, clave: l.clave || '', regalo: !!l.regalo, promo: !!l.promo })),
    subtotalCents: calc.subtotalCents, envioCents: calc.envioCents, descuentoCents: calc.descuentoCents, regaloCents: calc.regaloCents,
    totalCents: calc.totalCents, contraentrega: calc.contraentrega, promo: calc.promo, codigo: calc.codigo ? calc.codigo.codigo : ''
  });
};
