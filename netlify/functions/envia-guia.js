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

const E = require('../lib/envia');

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pesos(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
const soloDigitos = E.soloDigitos;

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

// Datos de quien recibe: lo del formulario o, si falta, lo del pedido
function datosDestino(p, f) {
  return { nombre: f.nombre || p.nombre, telefono: f.telefono || p.telefono, correo: p.correo, direccion: f.direccion || p.direccion,
    barrio: f.barrio || '', referencia: f.referencia || '', cp: f.cp || '110111' };
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

  if (!E.configurado()) {
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
    try {
      p.guia = await E.generar(datosDestino(p, f), p.totalCents, p.totalCents, f.opcion, p.referencia);
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
    opciones = await E.cotizar(datosDestino(p, {}), p.totalCents, p.totalCents);
  } catch (err) {
    errorCotizar = err.message;
    console.error('Envia ship/rate', err.message);
  }
  if (!opciones.length) opciones = [{ opcion: 'coordinadora|ground', nombre: 'Coordinadora Ground' }];

  const radios = opciones.map((o, i) => `
    <label class="op"><input type="radio" name="opcion" value="${esc(o.opcion)}"${i === 0 ? ' checked' : ''}>
    <span><strong>${esc(o.nombre)}</strong>${o.precio ? ' · ' + pesos(o.precio) : ''}
    ${o.comision ? `<br><small>Incluye comisión contraentrega ${pesos(o.comision)}</small>` : ''}
    ${o.entrega ? `<br><small>Entrega: ${esc(o.entrega)}</small>` : ''}</span></label>`).join('');

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
