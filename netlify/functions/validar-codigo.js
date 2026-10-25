// Valida un código de descuento contra el carrito, sin marcarlo como usado.
// POST { codigo, carrito, ciudad } → { valido, descuento, participante, mensaje, ... }
// El código se marca como usado al guardar el pedido contraentrega o cuando Wompi aprueba el pago.
const { getStore, connectLambda } = require('@netlify/blobs');
const tienda = require('../lib/tienda');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { valido: false, mensaje: 'Método no permitido' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { valido: false, mensaje: 'JSON inválido' }); }

  const armado = tienda.armar(b.carrito);
  if (armado.error) return json(400, { valido: false, mensaje: armado.error });

  let usados = null;
  try { connectLambda(event); usados = getStore('codigos-usados'); } catch (err) { console.error('Blobs no disponible', err.message); }
  const r = await tienda.revisarCodigo(b.codigo, armado, {
    usado: async (c) => !!(usados && await usados.get(c))
  });
  if (r.vacio) return json(200, { valido: false, mensaje: 'Escribe tu código' });
  if (!r.valido) return json(200, { valido: false, mensaje: r.mensaje });

  // Resumen para mostrar en el checkout (el total final se vuelve a calcular al crear el pedido)
  const placaEnCarrito = armado.lineas.find(l => l.tipo === 'placa');
  return json(200, {
    valido: true,
    codigo: r.codigo,
    tipo: r.tipo,
    descuento: r.descuentoCents,
    participante: r.participante,
    mensaje: r.mensaje,
    regalo: r.regalo,
    regaloIncluido: !!(r.regalo && placaEnCarrito),   // la placa del carrito queda de regalo
    regaloValor: r.regalo && placaEnCarrito ? placaEnCarrito.cents : 0,
    subtotal: armado.subtotalCents,
    porcentaje: r.tipo === 'concurso' ? 15 : 10
  });
};
