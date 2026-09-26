// Recibe la notificación de Wompi cuando una transacción cambia de estado.
// Esta es la única fuente de verdad para marcar un pedido como confirmado:
// no depende de que el cliente vuelva a la página después de pagar.
const crypto = require('crypto');

function getValueByPath(obj, path) {
  return path.split('.').reduce(function (acc, key) {
    return acc && acc[key] !== undefined ? acc[key] : undefined;
  }, obj);
}

// Wompi puede usar camelCase (SDK) o snake_case (API REST) según el campo.
function firstDefined() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
      return arguments[i];
    }
  }
  return '';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) {
    return { statusCode: 500, body: 'Falta configurar WOMPI_EVENTS_SECRET en Netlify' };
  }

  const sig = payload.signature;
  if (!sig || !Array.isArray(sig.properties) || !sig.checksum || !payload.timestamp) {
    return { statusCode: 400, body: 'Firma faltante o incompleta' };
  }

  // Paso 1-4 según la documentación de Wompi: concatenar propiedades + timestamp + secreto
  const concatenatedValues = sig.properties
    .map(function (prop) {
      const val = getValueByPath(payload.data, prop);
      return val !== undefined && val !== null ? String(val) : '';
    })
    .join('');

  const stringToHash = concatenatedValues + String(payload.timestamp) + secret;
  const computedChecksum = crypto.createHash('sha256').update(stringToHash).digest('hex');

  if (computedChecksum.toUpperCase() !== String(sig.checksum).toUpperCase()) {
    return { statusCode: 401, body: 'Firma inválida' };
  }

  // Firma verificada — procesamos el evento
  if (payload.event !== 'transaction.updated' || !payload.data || !payload.data.transaction) {
    return { statusCode: 200, body: 'Evento ignorado' };
  }

  const transaction = payload.data.transaction;

  if (transaction.status !== 'APPROVED') {
    return { statusCode: 200, body: 'Transacción no aprobada, sin acción' };
  }

  // Extrae datos del cliente y del envío (pueden venir en camelCase o snake_case)
  const customer = transaction.customer_data || transaction.customerData || {};
  const shipping = transaction.shipping_address || transaction.shippingAddress || {};

  const nombre = firstDefined(shipping.name, customer.full_name, customer.fullName);
  const telefono = firstDefined(shipping.phone_number, shipping.phoneNumber, customer.phone_number, customer.phoneNumber);
  const direccion = firstDefined(shipping.address_line_1, shipping.addressLine1);
  const ciudad = firstDefined(shipping.city);

  // "Correo: X | Mascota: Y | Producto: Z" fue guardado en addressLine2 al crear la transacción
  const addressLine2 = firstDefined(shipping.address_line_2, shipping.addressLine2);
  let correo = firstDefined(customer.email); // por si acaso Wompi sí lo trae
  let mascota = '';
  let nombreProducto = '';
  const match = /Correo:\s*(.*?)\s*\|\s*Mascota:\s*(.*?)\s*\|\s*Producto:\s*(.*)/.exec(addressLine2);
  if (match) {
    if (!correo) correo = match[1];
    mascota = match[2];
    nombreProducto = match[3];
  }

  // La talla queda dentro del nombre del producto, ej: "Collar de goma (Talla S) x2"
  let talla = '';
  const tallaMatch = /\(([^)]+)\)/.exec(nombreProducto);
  if (tallaMatch) talla = tallaMatch[1];

  // El tipo de envío se infiere de la ciudad (mismo criterio usado al calcular el costo)
  const tipoEnvio = /bogot|soacha/i.test(ciudad) ? 'Bogotá / Soacha' : 'Otra ciudad de Colombia';

  // Guarda el pedido en Netlify Forms (para que aparezca en tu panel, igual que antes)
  const formBody = new URLSearchParams({
    'form-name': 'datos-envio',
    nombre: nombre,
    mascota: mascota,
    telefono: telefono,
    correo: correo,
    direccion: direccion,
    ciudad: ciudad,
    tipo_envio: tipoEnvio,
    talla: talla
  }).toString();

  const siteUrl = 'https://wuuffpuppy.co/';

  try {
    await fetch(siteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody
    });
  } catch (err) {
    console.error('No se pudo guardar el registro en Netlify Forms', err);
  }

  // Envía el correo de confirmación con la marca Wuuff Puppy
  if (correo) {
    try {
      await fetch(siteUrl + '.netlify/functions/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: correo,
          toName: nombre,
          nombreProducto: nombreProducto,
          mascota: mascota,
          direccion: direccion,
          ciudad: ciudad
        })
      });
    } catch (err) {
      console.error('No se pudo enviar el correo de confirmación', err);
    }
  }

  return { statusCode: 200, body: 'Pedido procesado' };
};
