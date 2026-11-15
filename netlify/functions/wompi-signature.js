// Calcula en el servidor el total del pedido y la firma de integridad de Wompi,
// para que el Secreto de Integridad nunca quede expuesto y el navegador no pueda cambiar el precio.
// POST { reference, carrito, ciudad, codigo, regalo, perfil }
//   → { signature, amountInCents, nombreProducto }
// El pedido queda guardado (Netlify Blobs, "pedidos-wompi") para que el webhook marque el código
// como usado solo cuando Wompi apruebe el pago.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const tienda = require('../lib/tienda');
const resenas = require('../lib/resenas');
const bwf = require('../lib/bwf');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { error: 'JSON inválido' }); }

  const reference = String(body.reference || '');
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(reference)) return json(400, { error: 'Falta la referencia del pago' });
  if (!body.carrito) return json(400, { error: 'Actualiza la página e intenta de nuevo' });

  const secret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) return json(500, { error: 'Falta configurar la variable de entorno WOMPI_INTEGRITY_SECRET en Netlify' });

  let pedidos = null, usados = null;
  try { connectLambda(event); pedidos = getStore('pedidos-wompi'); usados = getStore('codigos-usados'); } catch (err) { console.error('Blobs no disponible', err.message); }

  // Black Wuuff Friday: la caja apartada (precio fijo, sin códigos); el resto, la tienda normal
  const esBwf = !!(body.carrito && body.carrito.bwf);
  let calc;
  if (esBwf) {
    try { calc = await bwf.calcular(getStore(bwf.STORE), body.carrito.bwf, body.ciudad); }
    catch (err) { console.error('Black Wuuff Friday', err.message); return json(503, { error: 'Intenta de nuevo en un momento' }); }
    if (!calc.ok) return json(400, { error: calc.error, cajaPerdida: !!calc.cajaPerdida });
  } else {
    calc = await tienda.calcular({ carrito: body.carrito, ciudad: body.ciudad, codigo: body.codigo, regalo: body.regalo }, {
      usado: async (c) => !!(usados && await usados.get(c))
    });
    if (!calc.ok) return json(400, { error: calc.error, codigoInvalido: !!calc.codigoInvalido, faltaRegalo: !!calc.faltaRegalo });
  }

  // Perfil de la placa (chip NFC): "ABC123" o "pendiente (Perro, Macho, Criollo)"
  // (con varias placas, uno por placa separados por coma)
  const perfilTexto = tienda.perfilesValidos(body.perfil).join(', ');
  const nombreProducto = calc.nombreProducto + (perfilTexto ? ' | Perfil NFC: ' + perfilTexto : '');
  const amountInCents = calc.totalCents;

  if (pedidos) {
    try {
      await pedidos.setJSON(reference, {
        reference, amountInCents, nombreProducto, creado: new Date().toISOString(),
        codigo: esBwf ? null : calc.codigo, descuentoCents: esBwf ? 0 : calc.descuentoCents, regalo: esBwf ? null : calc.regalo,
        avisos: esBwf ? calc.avisos : tienda.lineasAviso(calc),
        bwf: esBwf ? { n: calc.n, token: String(body.carrito.bwf.token) } : undefined,
        productos: resenas.productosDeCarrito(body.carrito, calc.regalo), ciudad: String(body.ciudad || '').slice(0, 80)
      });
    } catch (err) { console.error('No se pudo guardar el pedido de Wompi', err.message); }
  }

  const signature = crypto.createHash('sha256').update(`${reference}${amountInCents}COP${secret}`).digest('hex');
  return json(200, { signature, amountInCents, nombreProducto });
};
