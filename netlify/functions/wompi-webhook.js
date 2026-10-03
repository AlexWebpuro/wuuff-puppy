// Recibe la notificación de Wompi cuando una transacción cambia de estado.
// Esta es la única fuente de verdad para marcar un pedido como confirmado:
// no depende de que el cliente vuelva a la página después de pagar.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

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

  // La talla queda dentro del nombre del producto, ej: "Collar de goma (Talla S) x2".
  // Solo se toma el paréntesis que dice "Talla …" (la placa NFC lleva otro con sus colores).
  let talla = '';
  const tallaMatch = /\((Talla [^)]+)\)/.exec(nombreProducto);
  if (tallaMatch) talla = tallaMatch[1];

  // Placa NFC con perfil pendiente (el navegador no pudo crearlo): se crea aquí con los datos del pedido
  const pendiente = /Perfil NFC: pendiente \(([^,]+), ([^,]+), ([^)]+)\)/.exec(nombreProducto);
  if (pendiente) {
    try {
      const r = await fetch('https://wuuffpuppy.co/.netlify/functions/perfil-crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mascota: mascota, especie: pendiente[1].trim(), sexo: pendiente[2].trim(), raza: pendiente[3].trim(),
          contactoNombre: nombre, telefono: telefono, ciudad: ciudad, correo: correo })
      });
      const j = await r.json();
      if (r.ok && j.id) nombreProducto = nombreProducto.replace(pendiente[0], 'Perfil NFC: ' + j.id);
    } catch (err) {
      console.error('No se pudo crear el perfil NFC pendiente', err.message);
    }
  }

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
    talla: talla,
    producto: nombreProducto + ' | Ref: ' + (transaction.reference || transaction.id || ''),
    total: '$' + Math.round((transaction.amount_in_cents || transaction.amountInCents || 0) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    metodo_pago: 'wompi'
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

  // Placa NFC: el producto lleva "Perfil NFC: <id>". Se marca el perfil como pagado y se arma
  // el enlace privado de edición (va al correo del cliente) y la dirección para grabar en el chip.
  let urlEditar = '', urlChip = '';
  const perfilMatch = /Perfil NFC:\s*([A-Z0-9]{6,16})/.exec(nombreProducto);
  if (perfilMatch) {
    try {
      connectLambda(event);
      const store = getStore('perfiles-nfc');
      const perfil = await store.get(perfilMatch[1], { type: 'json' });
      if (perfil) {
        perfil.pedido = Object.assign({}, perfil.pedido, { estado: 'pagado', referencia: transaction.reference || transaction.id || '' });
        await store.setJSON(perfil.id, perfil);
        urlChip = siteUrl + 'm/' + perfil.id;
        urlEditar = siteUrl + 'placa-nfc/perfil/#id=' + perfil.id + '&clave=' + perfil.clave;
      }
    } catch (err) {
      console.error('No se pudo actualizar el perfil NFC', err.message);
    }
    // Aviso a la tienda con lo necesario para imprimir y grabar la placa
    if (process.env.RESEND_API_KEY) {
      const from = process.env.RESEND_FROM ? `Wuuff Puppy <${process.env.RESEND_FROM}>` : 'Wuuff Puppy <onboarding@resend.dev>';
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: from,
            to: [process.env.RESEND_REPLY_TO || 'wuuffpuppy@gmail.com'],
            subject: `🏷️ Pedido con placa NFC pagado · ${nombre || 'cliente'}`,
            html: `<div style="font-family:Arial,sans-serif;color:#2d4375;max-width:520px">
              <h2>🏷️ Pedido con placa NFC (pagado con Wompi)</h2>
              <p><strong>Producto:</strong> ${String(nombreProducto).replace(/[<>]/g, '')}</p>
              <p><strong>Cliente:</strong> ${String(nombre).replace(/[<>]/g, '')} · ${String(telefono).replace(/[<>]/g, '')}<br>
              <strong>Dirección:</strong> ${String(direccion).replace(/[<>]/g, '')}, ${String(ciudad).replace(/[<>]/g, '')}</p>
              ${urlChip ? `<p style="background:#fffbe6;padding:10px 12px;border-radius:10px"><strong>Grabar en el chip NFC:</strong><br><a href="${urlChip}">${urlChip}</a></p>` : '<p>⚠️ No se encontró el perfil NFC de este pedido.</p>'}
            </div>`
          })
        });
      } catch (err) {
        console.error('No se pudo avisar a la tienda del pedido con placa', err.message);
      }
    }
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
          ciudad: ciudad,
          perfilEditar: urlEditar
        })
      });
    } catch (err) {
      console.error('No se pudo enviar el correo de confirmación', err);
    }
  }

  return { statusCode: 200, body: 'Pedido procesado' };
};
