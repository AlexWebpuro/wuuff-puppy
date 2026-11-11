// Conexión con Envia.com (guías de Coordinadora). La usan envia-guia (enlace del correo de cada
// pedido contraentrega) y panel-pedidos (botón "Crear guía" del panel).
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
const BOGOTA = { city: '11001000', state: 'CN', country: 'CO' }; // código DANE de Bogotá
const CAJA = { length: 10, width: 10, height: 10 };               // caja de 10×10×10 cm
const PESO_KG = 0.5;

function apiBase() {
  return process.env.ENVIA_PRUEBAS === '1' ? 'https://api-test.envia.com' : 'https://api.envia.com';
}
function configurado() {
  return !!(process.env.ENVIA_API_KEY && process.env.ENVIA_ORIGEN_TELEFONO && process.env.ENVIA_ORIGEN_DIRECCION);
}
function soloDigitos(v) {
  return String(v || '').replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '');
}
// Las guías con recaudo se hacen solo en Bogotá (y Soacha, que se maneja como Bogotá)
function esBogota(ciudad) { return /bogot|soacha/i.test(String(ciudad || '')); }

async function llamar(ruta, cuerpo) {
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

// d = { nombre, telefono, correo, direccion, barrio, referencia, cp }
function destino(d) {
  return Object.assign({
    name: d.nombre,
    email: d.correo || undefined,
    phone: soloDigitos(d.telefono),
    phone_code: '57',
    street: d.direccion,
    district: d.barrio || '',
    reference: d.referencia || '',
    postalCode: d.cp || '110111'
  }, BOGOTA);
}

// cobrarCents: lo que la transportadora le cobra al cliente al entregar (0 = ya pagó)
function paquete(totalCents, cobrarCents) {
  const total = Math.round(totalCents / 100), cobrar = Math.round((cobrarCents || 0) / 100);
  const p = {
    type: 'box', content: 'Accesorios para mascota', amount: 1, declaredValue: total || cobrar,
    lengthUnit: 'CM', weightUnit: 'KG', weight: PESO_KG, dimensions: CAJA
  };
  if (cobrar > 0) p.additionalServices = [{ service: 'cash_on_delivery', data: { amount: String(cobrar) } }];
  return [p];
}

// Opciones de envío con su precio (de la más barata a la más cara)
async function cotizar(d, totalCents, cobrarCents) {
  const j = await llamar('/ship/rate/', {
    origin: origen(), destination: destino(d), packages: paquete(totalCents, cobrarCents),
    shipment: { type: 1, carrier: 'coordinadora' }, settings: { currency: 'COP' }
  });
  const ops = (j.data || []).filter(o => o && o.service).map(o => ({
    opcion: o.carrier + '|' + o.service, nombre: o.serviceDescription || o.service, precio: o.totalPrice || 0,
    comision: o.cashOnDeliveryCommission || 0, entrega: o.deliveryEstimate || ''
  }));
  ops.sort((a, b) => a.precio - b.precio);
  return ops;
}

// Crea la guía; devuelve { carrier, service, trackingNumber, trackUrl, label, totalPrice, shipmentId, creada }
async function generar(d, totalCents, cobrarCents, opcion, referencia) {
  const [carrier, service] = String(opcion || 'coordinadora|ground').split('|');
  const j = await llamar('/ship/generate/', {
    origin: origen(), destination: destino(d), packages: paquete(totalCents, cobrarCents),
    shipment: { type: 1, carrier: carrier, service: service, orderReference: referencia },
    settings: { printFormat: 'PDF', printSize: 'PAPER_4X6', currency: 'COP', comments: referencia }
  });
  const r = (j.data && j.data[0]) || j;
  if (!r.trackingNumber) throw new Error('Envia no devolvió número de guía');
  return {
    carrier: r.carrier || carrier, service: r.service || service, trackingNumber: r.trackingNumber,
    trackUrl: r.trackUrl || '', label: r.label || '', totalPrice: r.totalPrice || 0,
    shipmentId: r.shipmentId || null, creada: new Date().toISOString()
  };
}

module.exports = { configurado, esBogota, soloDigitos, cotizar, generar };
