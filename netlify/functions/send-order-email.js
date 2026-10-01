// Envía el correo de confirmación de pedido, con la marca Wuuff Puppy,
// usando la API de Resend. La llave nunca queda expuesta en el navegador.
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

  const { toEmail, toName, nombreProducto, mascota, direccion, ciudad, metodoPago, total } = body;
  const contraentrega = metodoPago === 'contraentrega';

  if (!toEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el correo del cliente' }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Falta RESEND_API_KEY');
    return { statusCode: 500, body: JSON.stringify({ error: 'Falta configurar RESEND_API_KEY en Netlify' }) };
  }

  // Con el dominio ya verificado en Resend, usa una dirección propia.
  // Si no configuras RESEND_FROM en Netlify, cae de vuelta a la dirección
  // de prueba de Resend, que solo puede enviar a tu propia cuenta de Resend.
  // RESEND_FROM ahora solo necesita el correo simple (ej: pedidos@wuuffpuppy.co),
  // sin espacios ni símbolos — el nombre de marca se agrega aquí mismo.
  const fromEmail = process.env.RESEND_FROM;
  const fromAddress = fromEmail ? `Wuuff Puppy <${fromEmail}>` : 'Wuuff Puppy <onboarding@resend.dev>';
  // Si el cliente responde el correo, que le llegue a tu bandeja real,
  // aunque el remitente use una dirección del dominio sin buzón detrás.
  const replyTo = process.env.RESEND_REPLY_TO || 'wuuffpuppy@gmail.com';
  console.log('Enviando correo a:', toEmail, '| Desde:', fromAddress, '| Responder a:', replyTo);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#2d4375;">
      <h1 style="font-size:22px;">¡Gracias por tu pedido${toName ? ', ' + toName : ''}! 🐾</h1>
      <p>${contraentrega ? `Recibimos tu pedido y ya lo estamos preparando. <strong>Pagas ${total || 'el total'} al recibirlo</strong> (contraentrega).` : 'Tu pago fue aprobado y ya estamos preparando todo.'}</p>
      <div style="background:#e8f0fb;border-radius:12px;padding:16px 20px;margin:20px 0;">
        ${nombreProducto ? `<p style="margin:4px 0;"><strong>Producto:</strong> ${nombreProducto}</p>` : ''}
        ${mascota ? `<p style="margin:4px 0;"><strong>Perrihijo:</strong> ${mascota}</p>` : ''}
        ${direccion ? `<p style="margin:4px 0;"><strong>Dirección:</strong> ${direccion}${ciudad ? ', ' + ciudad : ''}</p>` : ''}
        ${total ? `<p style="margin:4px 0;"><strong>Total:</strong> ${total}${contraentrega ? ' · se paga al recibir' : ''}</p>` : ''}
      </div>
      <p>Te contactaremos pronto por WhatsApp para coordinar el envío.</p>
      <p style="margin-top:28px;">— El equipo de Wuuff Puppy 💙</p>
    </div>
  `;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        reply_to: replyTo,
        to: [toEmail],
        subject: '¡Tu pedido en Wuuff Puppy fue confirmado! 🐾',
        html: html
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend rechazó el envío. Status:', resp.status, '| Detalle:', errText);
      return { statusCode: resp.status, body: JSON.stringify({ error: 'Resend rechazó el envío', detail: errText }) };
    }

    const okData = await resp.json();
    console.log('Correo enviado OK. Respuesta de Resend:', JSON.stringify(okData));
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Error de conexión con Resend:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Error de conexión con Resend' }) };
  }
};
