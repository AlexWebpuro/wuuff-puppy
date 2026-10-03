// Registra un pedido con pago contraentrega (solo Bogotá / Soacha).
// No pasa por Wompi: guarda el pedido en Netlify Forms, le avisa a la tienda
// por correo y envía la confirmación a la clienta.
const SITE_URL = 'https://wuuffpuppy.co/';

function limpiar(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}

function pesos(cents) {
  return '$' + Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  // Campo trampa para bots: si viene lleno, respondemos OK sin registrar nada
  if (body.botField) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, referencia: 'CE-0' }) };
  }

  const pedido = {
    nombre: limpiar(body.nombre, 120),
    mascota: limpiar(body.mascota, 80),
    telefono: limpiar(body.telefono, 30),
    correo: limpiar(body.correo, 160),
    direccion: limpiar(body.direccion, 200),
    ciudad: limpiar(body.ciudad, 80),
    talla: limpiar(body.talla, 20),
    producto: limpiar(body.producto, 600)
  };
  const totalCents = parseInt(body.totalCents, 10);

  const faltantes = ['nombre', 'telefono', 'direccion', 'ciudad', 'producto'].filter(function (k) { return !pedido[k]; });
  if (faltantes.length || !totalCents || totalCents <= 0 || totalCents > 500000000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos del pedido' }) };
  }
  if ((pedido.telefono.match(/\d/g) || []).length < 7) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Teléfono inválido' }) };
  }

  const referencia = 'CE-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const total = pesos(totalCents);

  // 1. Registro en Netlify Forms (mismo formulario que los pedidos pagados con Wompi)
  try {
    await fetch(SITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'datos-envio',
        nombre: pedido.nombre,
        mascota: pedido.mascota,
        telefono: pedido.telefono,
        correo: pedido.correo,
        direccion: pedido.direccion,
        ciudad: pedido.ciudad,
        tipo_envio: 'Bogotá / Soacha',
        talla: pedido.talla,
        producto: pedido.producto + ' | Ref: ' + referencia,
        total: total,
        metodo_pago: 'contraentrega'
      }).toString()
    });
  } catch (err) {
    console.error('No se pudo guardar el pedido en Netlify Forms', err);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM;
  const fromAddress = fromEmail ? `Wuuff Puppy <${fromEmail}>` : 'Wuuff Puppy <onboarding@resend.dev>';
  const tienda = process.env.RESEND_REPLY_TO || 'wuuffpuppy@gmail.com';

  // 2. Aviso a la tienda: un pedido contraentrega no aparece en Wompi
  if (apiKey) {
    const wa = 'https://wa.me/57' + pedido.telefono.replace(/\D/g, '').replace(/^57/, '');
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#2d4375;">
        <h2>📦 Nuevo pedido CONTRAENTREGA</h2>
        <p><strong>Cobrar al entregar: ${total}</strong> · Ref: ${referencia}</p>
        <p><strong>Producto:</strong> ${pedido.producto}</p>
        <p><strong>Cliente:</strong> ${pedido.nombre}<br>
        <strong>Perrihijo:</strong> ${pedido.mascota || '-'}<br>
        <strong>Teléfono:</strong> ${pedido.telefono} (<a href="${wa}">WhatsApp</a>)<br>
        <strong>Correo:</strong> ${pedido.correo || '-'}<br>
        <strong>Dirección:</strong> ${pedido.direccion}, ${pedido.ciudad}</p>
      </div>`;
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromAddress,
          to: [tienda],
          reply_to: pedido.correo || undefined,
          subject: `📦 Pedido contraentrega ${total} · ${pedido.nombre}`,
          html: html
        })
      });
      if (!resp.ok) console.error('Resend rechazó el aviso a la tienda:', resp.status, await resp.text());
    } catch (err) {
      console.error('No se pudo avisar a la tienda', err.message);
    }
  } else {
    console.error('Falta RESEND_API_KEY: no se envió el aviso del pedido contraentrega');
  }

  // 3. Confirmación a la clienta
  if (pedido.correo) {
    try {
      await fetch(SITE_URL + '.netlify/functions/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: pedido.correo,
          toName: pedido.nombre,
          nombreProducto: pedido.producto,
          mascota: pedido.mascota,
          direccion: pedido.direccion,
          ciudad: pedido.ciudad,
          metodoPago: 'contraentrega',
          total: total
        })
      });
    } catch (err) {
      console.error('No se pudo enviar la confirmación a la clienta', err.message);
    }
  }

  console.log('Pedido contraentrega registrado', referencia, total);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, referencia: referencia })
  };
};
