// Registra un pedido con pago contraentrega (solo Bogotá, pedidos desde $49.900 que no sean solo collares y placa).
// No pasa por Wompi: guarda el pedido en Netlify Forms como "pendiente de confirmar",
// avisa a la tienda por correo (y por WhatsApp si CallMeBot está configurado)
// y le manda al cliente el correo de "Recibimos tu pedido".
const { getStore, connectLambda } = require('@netlify/blobs');
const tienda = require('../lib/tienda');
const resenas = require('../lib/resenas');
const P = require('../lib/perfiles');

const SITE_URL = 'https://wuuffpuppy.co/';
const MAXIMO_CENTS = 300000000;     // $3.000.000: tope de recaudo en efectivo de Coordinadora

function limpio(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}
function pesos(cents) {
  return '$' + Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }
  if (b.honeypot) return { statusCode: 200, body: JSON.stringify({ ok: true, referencia: 'CE-0' }) };

  const pedido = {
    nombre: limpio(b.nombre, 120),
    mascota: limpio(b.mascota, 80),
    telefono: limpio(b.telefono, 30),
    correo: limpio(b.correo, 160),
    direccion: limpio(b.direccion, 250),
    ciudad: limpio(b.ciudad, 80),
    talla: limpio(b.talla, 40),
    producto: '',
    // Un perfil NFC por placa (perfilIds); perfilId es el de antes (una sola placa)
    perfilIds: (Array.isArray(b.perfilIds) ? b.perfilIds : [b.perfilId]).filter(id => /^[A-Z0-9]{6,16}$/.test(id || '')).slice(0, 6)
  };

  if (b.carrito && b.carrito.bwf) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Las cajas del Black Wuuff Friday se pagan en línea' }) };
  }
  if (!pedido.nombre || !pedido.telefono || !pedido.direccion) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos del pedido' }) };
  }
  if (!/bogot/i.test(pedido.ciudad) || /soacha/i.test(pedido.ciudad)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'La contraentrega solo está disponible en Bogotá' }) };
  }

  // El total se calcula aquí (precios, envío y código); nunca se usa el que manda el navegador
  let usados = null;
  try { connectLambda(event); usados = getStore('codigos-usados'); } catch (err) { console.error('Blobs no disponible', err.message); }
  const calc = await tienda.calcular({ carrito: b.carrito, ciudad: pedido.ciudad, codigo: b.codigo, regalo: b.regalo }, {
    usado: async (c) => !!(usados && await usados.get(c))
  });
  if (!calc.ok) {
    return { statusCode: 400, body: JSON.stringify({ error: calc.error, codigoInvalido: !!calc.codigoInvalido, faltaRegalo: !!calc.faltaRegalo }) };
  }
  const totalCents = calc.totalCents;
  pedido.producto = limpio(calc.nombreProducto + (pedido.perfilIds.length ? ' | Perfil NFC: ' + pedido.perfilIds.join(', ') : ''), 900);
  // Mínimo de $49.900 con el subtotal ANTES del descuento (ej.: collar + placa $64.900 − 10 % sigue aplicando)
  if (!calc.contraentrega || totalCents > MAXIMO_CENTS) {
    return { statusCode: 400, body: JSON.stringify({ error: 'El valor del pedido no aplica para contraentrega' }) };
  }
  const avisos = tienda.lineasAviso(calc);

  const referencia = 'CE-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
  const total = pesos(totalCents);

  // Código del concurso: 1 solo uso. En contraentrega se marca al guardar el pedido.
  if (calc.codigo && calc.codigo.tipo === 'concurso' && usados) {
    try {
      await usados.setJSON(calc.codigo.codigo, { fecha: new Date().toISOString(), pedido: referencia, cliente: pedido.nombre, metodo: 'contraentrega', participante: calc.codigo.participante });
    } catch (err) {
      console.error('No se pudo marcar el código como usado', err.message);
    }
  }

  // 1. Guarda el pedido en Netlify Forms (mismo formulario "datos-envio" que usan los pagos con Wompi)
  try {
    await fetch(SITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'datos-envio',
        nombre: pedido.nombre, mascota: pedido.mascota, telefono: pedido.telefono, correo: pedido.correo,
        direccion: pedido.direccion, ciudad: pedido.ciudad, tipo_envio: 'Bogotá / Soacha', talla: pedido.talla,
        producto: pedido.producto + ' | Ref: ' + referencia + ' | PENDIENTE DE CONFIRMAR' + (avisos.length ? ' | ' + avisos.join(' | ') : ''),
        total: total + ' (contraentrega)',
        metodo_pago: 'contraentrega'
      }).toString()
    });
  } catch (err) {
    console.error('No se pudo guardar el pedido contraentrega en Netlify Forms', err.message);
  }

  // 1b. Guarda el pedido para poder crear la guía de Envia.com con un clic (función envia-guia)
  let urlGuia = '';
  try {
    const token = require('crypto').randomBytes(18).toString('hex');
    // totalCents ya trae el descuento: es el valor del recaudo contraentrega en la guía de Envia
    await getStore('pedidos-contraentrega').setJSON(referencia, Object.assign({}, pedido, {
      referencia: referencia, totalCents: totalCents, token: token, estado: 'pendiente-confirmar', creado: new Date().toISOString(),
      codigo: calc.codigo, descuentoCents: calc.descuentoCents, regalo: calc.regalo
    }));
    urlGuia = SITE_URL + '.netlify/functions/envia-guia?ref=' + encodeURIComponent(referencia) + '&t=' + token;
  } catch (err) {
    console.error('No se pudo guardar el pedido para Envia', err.message);
  }
  // 1c. Unos días después se le pide la reseña (función programada resenas-invitar)
  try {
    await resenas.guardarPorInvitar(getStore('resenas-invitaciones'), referencia, { correo: pedido.correo, nombre: pedido.nombre,
      mascota: pedido.mascota, ciudad: pedido.ciudad, productos: resenas.productosDeCarrito(b.carrito, calc.regalo) });
  } catch (err) {
    console.error('No se pudo guardar la invitación a reseñar', err.message);
  }

  // 2. Placa NFC: se marca el perfil y se arman los enlaces (chip y edición)
  let perfiles = [];
  if (pedido.perfilIds.length) {
    try { perfiles = await P.marcarPerfiles(getStore('perfiles-nfc'), pedido.perfilIds, 'contraentrega-pendiente', referencia, SITE_URL); }
    catch (err) { console.error('No se pudo actualizar el perfil NFC', err.message); }
  }
  const urlEditar = perfiles.length ? perfiles[0].urlEditar : '';

  const telCliente = pedido.telefono.replace(/\D/g, '').replace(/^(?!57)(\d{10})$/, '57$1');

  // 3. Aviso a la tienda por correo
  if (process.env.RESEND_API_KEY) {
    const from = process.env.RESEND_FROM ? `Wuuff Puppy <${process.env.RESEND_FROM}>` : 'Wuuff Puppy <onboarding@resend.dev>';
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from,
          to: [process.env.RESEND_REPLY_TO || 'wuuffpuppy@gmail.com'],
          subject: `💵 Pedido contraentrega ${total} · ${pedido.nombre} · confirmar por WhatsApp`,
          html: `<div style="font-family:Arial,sans-serif;color:#2d4375;max-width:520px">
            <h2>💵 Nuevo pedido contraentrega (pendiente de confirmar)</h2>
            <p><strong>Referencia:</strong> ${referencia}<br><strong>Cobrar al entregar:</strong> ${total}</p>
            <p><strong>Producto:</strong> ${pedido.producto}</p>
            ${avisos.length ? `<p style="background:#fff4e5;padding:10px 12px;border-radius:10px">${avisos.map(a => a.replace(/[<>]/g, '')).join('<br>')}</p>` : ''}
            <p><strong>Cliente:</strong> ${pedido.nombre} · ${pedido.telefono}${pedido.correo ? ' · ' + pedido.correo : ''}<br>
            <strong>Dirección:</strong> ${pedido.direccion}, ${pedido.ciudad}<br>
            <strong>Mascota:</strong> ${pedido.mascota}</p>
            ${P.htmlChips(perfiles)}
            <p><a href="https://wa.me/${telCliente}" style="display:inline-block;background:#25D366;color:#fff;font-weight:bold;padding:10px 16px;border-radius:10px;text-decoration:none;">Escribirle por WhatsApp</a></p>
            <p style="font-size:13px">Antes de crear la guía en Envia.com: confirma dirección, que haya alguien para recibir y que tenga el efectivo listo.</p>
            ${urlGuia ? `<p><a href="${urlGuia}" style="display:inline-block;background:#4964AF;color:#fff;font-weight:bold;padding:10px 16px;border-radius:10px;text-decoration:none;">📦 Ya confirmé: crear guía en Envia</a></p>` : ''}
            <p style="font-size:13px">También lo tienes en el <a href="${SITE_URL}panel/">panel de pedidos</a>, donde puedes crear la guía y marcarlo enviado.</p>
          </div>`
        })
      });
    } catch (err) {
      console.error('No se pudo avisar a la tienda del pedido contraentrega', err.message);
    }
  }

  // 4. Aviso a la tienda por WhatsApp (opcional, con CallMeBot)
  if (process.env.CALLMEBOT_PHONE && process.env.CALLMEBOT_APIKEY) {
    const texto = `💵 Pedido contraentrega ${referencia}\n${pedido.producto.replace(/\s*\|\s*Perfil NFC:.*$/, '')}\nCobrar: ${total}${avisos.length ? '\n' + avisos.join('\n') : ''}\n${pedido.nombre} · ${pedido.telefono}\n${pedido.direccion}, ${pedido.ciudad}${urlGuia ? '\n\nCrear guía (después de confirmar): ' + urlGuia : ''}`;
    try {
      await fetch('https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(process.env.CALLMEBOT_PHONE) +
        '&text=' + encodeURIComponent(texto) + '&apikey=' + encodeURIComponent(process.env.CALLMEBOT_APIKEY));
    } catch (err) {
      console.error('No se pudo enviar el aviso por WhatsApp', err.message);
    }
  }

  // 5. Correo al cliente: "Recibimos tu pedido, pagas al recibir"
  if (pedido.correo) {
    try {
      await fetch(SITE_URL + '.netlify/functions/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: pedido.correo, toName: pedido.nombre, nombreProducto: pedido.producto.replace(/\s*\|\s*Perfil NFC:.*$/, ''),
          mascota: pedido.mascota, direccion: pedido.direccion, ciudad: pedido.ciudad,
          metodoPago: 'contraentrega', total: total, perfilEditar: urlEditar, perfiles: perfiles.map(p => ({ url: p.urlEditar, mascota: p.mascota })),
          descuento: calc.descuentoCents ? tienda.pesos(calc.descuentoCents) : '', codigo: calc.codigo ? calc.codigo.codigo : '',
          regalo: calc.regalo ? calc.regalo.texto : ''
        })
      });
    } catch (err) {
      console.error('No se pudo enviar el correo al cliente', err.message);
    }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, referencia: referencia, totalCents: totalCents, producto: pedido.producto }) };
};
