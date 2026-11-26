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

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

// Datos de envío del cliente (para el aviso del pedido si Wompi no los devuelve completos)
function clienteValido(c) {
  if (!c || typeof c !== 'object') return undefined;
  const t = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  return { nombre: t(c.nombre, 120), mascota: t(c.mascota, 80), telefono: t(c.telefono, 30), correo: t(c.correo, 160), direccion: t(c.direccion, 250), ciudad: t(c.ciudad, 80) };
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

  // Las cajas del Black Wuuff Friday (10 cajas a $99.900) se cancelaron el 23 nov 2026: ya no se cobran
  if (body.carrito && body.carrito.bwf) return json(400, { error: 'Esta promoción ya no está disponible' });
  const ahora = tienda.ahoraDe(event, body.simular);
  let cuposNombre = Infinity;
  if (tienda.promoActiva(ahora)) { try { cuposNombre = await tienda.cuposNombreLibres(getStore('promo-marcas')); } catch (err) { console.error('Blobs no disponible', err.message); } }
  const calc = await tienda.calcular({ carrito: body.carrito, ciudad: body.ciudad, codigo: body.codigo, regalo: body.regalo, metodo: 'wompi' }, {
    ahora, cuposNombre,
    usado: async (c) => !!(usados && await usados.get(c))
  });
  if (!calc.ok) return json(400, { error: calc.error, codigoInvalido: !!calc.codigoInvalido, faltaRegalo: !!calc.faltaRegalo });

  // Perfil de la placa (chip NFC): "ABC123" o "pendiente (Perro, Macho, Criollo)"
  // (con varias placas, uno por placa separados por coma)
  const perfilTexto = tienda.perfilesValidos(body.perfil).join(', ');
  const nombreProducto = calc.nombreProducto + (perfilTexto ? ' | Perfil NFC: ' + perfilTexto : '');
  const amountInCents = calc.totalCents;

  if (pedidos) {
    try {
      await pedidos.setJSON(reference, {
        reference, amountInCents, nombreProducto, creado: new Date().toISOString(),
        codigo: calc.codigo, descuentoCents: calc.descuentoCents, regalo: calc.regalo,
        avisos: tienda.lineasAviso(calc), promo: calc.promo || undefined, nombresGratis: calc.nombresGratis || undefined,
        lineaPrimerPedido: calc.promo ? tienda.lineaPrimerPedido(calc, body.ciudad, amountInCents) : undefined,
        inv: tienda.invDeCarrito(body.carrito, calc),
        productos: resenas.productosDeCarrito(body.carrito, calc.regalo), ciudad: String(body.ciudad || '').slice(0, 80),
        cliente: clienteValido(body.cliente)
      });
    } catch (err) { console.error('No se pudo guardar el pedido de Wompi', err.message); }
  }

  const signature = crypto.createHash('sha256').update(`${reference}${amountInCents}COP${secret}`).digest('hex');
  return json(200, { signature, amountInCents, nombreProducto, promo: calc.promo, avisoCodigo: calc.avisoCodigo || '' });
};
