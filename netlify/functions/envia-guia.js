// Crea la guía de Envia.com (Coordinadora) para un pedido contraentrega de Bogotá.
//
// Cómo se usa: el correo/WhatsApp de "Nuevo pedido contraentrega" trae un enlace a esta función.
//   GET  → muestra el pedido, la cotización de Envia y un formulario para revisar la dirección.
//   POST → crea la guía con el recaudo contraentrega y muestra el número de guía, el PDF
//          y un botón para mandarle el rastreo al cliente por WhatsApp.
// Si la guía ya se creó, solo la muestra (no crea una segunda).
//
// Variables de entorno en Netlify:
//   ENVIA_API_KEY            (obligatoria) llave de Envia.com → Desarrolladores → Acceso de API
//   ENVIA_ORIGEN_TELEFONO    (obligatoria) celular de quien entrega el paquete
//   ENVIA_ORIGEN_DIRECCION   (obligatoria) dirección de recogida
//   ENVIA_ORIGEN_BARRIO      (opcional)
//   ENVIA_ORIGEN_CP          (opcional) código postal de la dirección de recogida, por defecto 110111
//   ENVIA_ORIGEN_NOMBRE      (opcional) por defecto "Wuuff Puppy"
//   ENVIA_ORIGEN_CORREO      (opcional) por defecto wuuffpuppy@gmail.com
//   ENVIA_PRUEBAS = 1        (opcional) usa el ambiente de pruebas de Envia (no crea guías reales)
const { getStore, connectLambda } = require('@netlify/blobs');

const BOGOTA = { city: '11001000', state: 'CN', country: 'CO' }; // código DANE de Bogotá
const CAJA = { length: 10, width: 10, height: 10 };               // caja de 10×10×10 cm
const PESO_KG = 0.5;

function apiBase() {
  return process.env.ENVIA_PRUEBAS === '1' ? 'https://api-test.envia.com' : 'https://api.envia.com';
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pesos(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function soloDigitos(v) {
  return String(v || '').replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
}

function pagina(titulo, cuerpo, status) {
  return {
    statusCode: status || 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} · Wuuff Puppy</title><meta name="robots" content="noindex,nofollow">
<style>
body{margin:0;background:#f9f0ee;font-family:Arial,Helvetica,sans-serif;color:#2d4375}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:22px;margin:8px 0 14px}
.tarjeta{background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
label{display:block;font-size:13px;font-weight:bold;margin:10px 0 4px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c9d1e6;border-radius:10px;font-size:16px}
.op{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #eef}
.op:first-child{border-top:0}.op input{width:auto;margin-top:3px}
.btn{display:block;width:100%;box-sizing:border-box;text-align:center;border:0;border-radius:12px;padding:14px;font-size:17px;font-weight:bold;text-decoration:none;cursor:pointer;margin:10px 0 0}
.azul{background:#4964af;color:#fff}.verde{background:#25d366;color:#fff}.claro{background:#eef1fa;color:#2d4375}
.aviso{background:#fffbe6;border-radius:12px;padding:10px 12px;font-size:14px}
.error{background:#fdecea;color:#8a1f11;border-radius:12px;padding:10px 12px;font-size:14px;white-space:pre-wrap}
small{color:#5b6b93}
</style></head><body><main>${cuerpo}</main></body></html>`
  };
}

async function envia(ruta, cuerpo) {
  const r = await fetch(apiBase() + ruta, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.ENVIA_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  let j = null;
  try { j = await r.json(); } catch (e) { /* respuesta sin JSON */ }
  if (!r.ok || !j || j.meta === 'error') {
    const msg = (j && j.error && (j.error.description || j.error.message)) || (j && j.message) || ('HTTP ' + r.status);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return j;
}

function origen() {
  return Object.assign({
    name: process.env.ENVIA_ORIGEN_NOMBRE || 'Wuuff Puppy',
    company: 'Wuuff Puppy',
    email: process.env.ENVIA_ORIGEN_CORREO || 'wuuffpuppy@gmail.com',
    phone: soloDigitos(process.env.ENVIA_ORIGEN_TELEFONO),
    phone_code: '57',
    street: process.env.ENVIA_ORIGEN_DIRECCION,
    district: process.env.ENVIA_ORIGEN_BARRIO || '',
    postalCode: process.env.ENVIA_ORIGEN_CP || '110111'
  }, BOGOTA);
}

function destino(p, f) {
  return Object.assign({
    name: f.nombre || p.nombre,
    email: p.correo || undefined,
    phone: soloDigitos(f.telefono || p.telefono),
    phone_code: '57',
    street: f.direccion || p.direccion,
    district: f.barrio || '',
    reference: f.referencia || '',
    postalCode: f.cp || '110111'
  }, BOGOTA);
}

function paquete(p) {
  const total = Math.round(p.totalCents / 100);
  return [{
    type: 'box',
    content: 'Accesorios para mascota',
    amount: 1,
    declaredValue: total,
    lengthUnit: 'CM',
    weightUnit: 'KG',
    weight: PESO_KG,
    dimensions: CAJA,
    additionalServices: [{ service: 'cash_on_delivery', data: { amount: String(total) } }]
  }];
}

function vistaGuia(p) {
  const g = p.guia;
  const tel = '57' + soloDigitos(p.telefono);
  const msg = `¡Hola ${p.nombre.split(' ')[0]}! 🐾 Tu pedido de Wuuff Puppy ya va en camino con Coordinadora.\n` +
    `Número de guía: ${g.trackingNumber}\n` + (g.trackUrl ? `Rastréalo aquí: ${g.trackUrl}\n` : '') +
    `Recuerda tener listos ${pesos(p.totalCents / 100)} para pagar al recibir 💵`;
  return pagina('Guía creada', `
    <h1>✅ Guía creada</h1>
    <div class="tarjeta">
      <p><strong>Pedido:</strong> ${esc(p.referencia)}<br><strong>Cliente:</strong> ${esc(p.nombre)}<br>
      <strong>Guía ${esc(g.carrier || '')}:</strong> ${esc(g.trackingNumber)}<br>
      <strong>Cobrar al entregar:</strong> ${pesos(p.totalCents / 100)}${g.totalPrice ? `<br><strong>Costo de la guía:</strong> ${pesos(g.totalPrice)}` : ''}</p>
      <a class="btn azul" href="${esc(g.label)}" target="_blank" rel="noopener">Descargar guía (PDF)</a>
      <a class="btn verde" href="https://wa.me/${tel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviarle el rastreo por WhatsApp</a>
      ${g.trackUrl ? `<a class="btn claro" href="${esc(g.trackUrl)}" target="_blank" rel="noopener">Ver rastreo</a>` : ''}
    </div>
    <p class="aviso">Imprime la guía, pégala en la caja y programa la recogida en Envia.com (o lleva el paquete a un punto Coordinadora).</p>`);
}

exports.handler = async function (event) {
  const q = event.queryStringParameters || {};
  let f = {};
  if (event.httpMethod === 'POST') {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
    f = Object.fromEntries(new URLSearchParams(raw));
  } else if (event.httpMethod !== 'GET') {
    return pagina('Error', '<p class="error">Método no permitido</p>', 405);
  }
  const ref = f.ref || q.ref || '';
  const t = f.t || q.t || '';

  if (!process.env.ENVIA_API_KEY || !process.env.ENVIA_ORIGEN_TELEFONO || !process.env.ENVIA_ORIGEN_DIRECCION) {
    return pagina('Falta configuración', '<h1>Falta configurar Envia</h1><p class="error">En Netlify faltan las variables ENVIA_API_KEY, ENVIA_ORIGEN_TELEFONO o ENVIA_ORIGEN_DIRECCION.</p>', 500);
  }

  connectLambda(event);
  const store = getStore('pedidos-contraentrega');
  const p = /^CE-[A-Z0-9-]{4,30}$/.test(ref) ? await store.get(ref, { type: 'json' }) : null;
  if (!p || !t || p.token !== t) {
    return pagina('No encontrado', '<h1>Pedido no encontrado</h1><p class="error">El enlace no es válido o el pedido no existe.</p>', 404);
  }
  if (p.guia) return vistaGuia(p);

  // POST: crear la guía
  if (event.httpMethod === 'POST') {
    const [carrier, service] = String(f.opcion || 'coordinadora|ground').split('|');
    try {
      const j = await envia('/ship/generate/', {
        origin: origen(),
        destination: destino(p, f),
        packages: paquete(p),
        shipment: { type: 1, carrier: carrier, service: service, orderReference: p.referencia },
        settings: { printFormat: 'PDF', printSize: 'PAPER_4X6', currency: 'COP', comments: p.referencia }
      });
      const d = (j.data && j.data[0]) || j;
      if (!d.trackingNumber) throw new Error('Envia no devolvió número de guía');
      p.guia = {
        carrier: d.carrier || carrier, service: d.service || service, trackingNumber: d.trackingNumber,
        trackUrl: d.trackUrl || '', label: d.label || '', totalPrice: d.totalPrice || 0,
        shipmentId: d.shipmentId || null, creada: new Date().toISOString()
      };
      p.estado = 'guia-creada';
      await store.setJSON(p.referencia, p);
      return vistaGuia(p);
    } catch (err) {
      console.error('Envia ship/generate', err.message);
      return pagina('Error', `<h1>No se pudo crear la guía</h1><p class="error">${esc(err.message)}</p>
        <p class="aviso">Si dice que no hay saldo o falta un dato, corrígelo y vuelve a intentar. También puedes crearla a mano en Envia.com.</p>
        <a class="btn claro" href="?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}">Volver</a>`, 502);
    }
  }

  // GET: cotizar y mostrar el formulario
  let opciones = [], errorCotizar = '';
  try {
    const j = await envia('/ship/rate/', {
      origin: origen(), destination: destino(p, {}), packages: paquete(p),
      shipment: { type: 1, carrier: 'coordinadora' }, settings: { currency: 'COP' }
    });
    opciones = (j.data || []).filter(o => o && o.service);
  } catch (err) {
    errorCotizar = err.message;
    console.error('Envia ship/rate', err.message);
  }
  if (!opciones.length) opciones = [{ carrier: 'coordinadora', service: 'ground', serviceDescription: 'Coordinadora Ground' }];
  opciones.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0));

  const radios = opciones.map((o, i) => `
    <label class="op"><input type="radio" name="opcion" value="${esc(o.carrier + '|' + o.service)}"${i === 0 ? ' checked' : ''}>
    <span><strong>${esc(o.serviceDescription || o.service)}</strong>${o.totalPrice ? ' · ' + pesos(o.totalPrice) : ''}
    ${o.cashOnDeliveryCommission ? `<br><small>Incluye comisión contraentrega ${pesos(o.cashOnDeliveryCommission)}</small>` : ''}
    ${o.deliveryEstimate ? `<br><small>Entrega: ${esc(o.deliveryEstimate)}</small>` : ''}</span></label>`).join('');

  return pagina('Crear guía', `
    <h1>📦 Crear guía en Envia</h1>
    <div class="tarjeta">
      <p><strong>Pedido:</strong> ${esc(p.referencia)}<br><strong>Producto:</strong> ${esc(p.producto)}<br>
      <strong>Cobrar al entregar:</strong> ${pesos(p.totalCents / 100)}</p>
    </div>
    <p class="aviso">Créala solo después de confirmar por WhatsApp: dirección, que haya alguien para recibir y que tenga el efectivo listo. Si no recibe, se cobra el flete de regreso.</p>
    ${errorCotizar ? `<p class="error">No se pudo cotizar: ${esc(errorCotizar)}</p>` : ''}
    <form method="post" class="tarjeta">
      <input type="hidden" name="ref" value="${esc(ref)}"><input type="hidden" name="t" value="${esc(t)}">
      ${radios}
      <label>Nombre de quien recibe</label><input name="nombre" value="${esc(p.nombre)}" required>
      <label>Celular</label><input name="telefono" value="${esc(p.telefono)}" inputmode="tel" required>
      <label>Dirección</label><input name="direccion" value="${esc(p.direccion)}" required>
      <label>Barrio</label><input name="barrio" value="">
      <label>Indicaciones (torre, apto, portería…)</label><input name="referencia" value="">
      <label>Código postal</label><input name="cp" value="110111" inputmode="numeric">
      <small>Si no lo sabes, búscalo en codigopostal.gov.co con la dirección.</small>
      <button class="btn azul" type="submit" onclick="this.disabled=true;this.textContent='Creando guía…';this.form.submit()">Crear guía</button>
    </form>`);
};
