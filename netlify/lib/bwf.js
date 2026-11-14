// Black Wuuff Friday (wuuffpuppy.co/blackfriday/): 10 cajas con el combo completo + un regalo según el número de caja.
//   - Al tocar "Quiero mi caja" se APARTA la siguiente caja libre por 10 minutos (así el cliente sabe qué regalo le toca
//     y escribe el nombre del collar o los datos de la placa antes de pagar).
//   - El número DEFINITIVO se confirma cuando Wompi aprueba el pago (wompi-webhook). Si dos personas apartaron la misma
//     caja (casi imposible), la segunda queda con la siguiente libre y el pedido lleva un aviso para revisar el regalo.
//   - Solo pago en línea (Wompi), sin códigos de descuento ni contraentrega.
// Las cajas se guardan en Netlify Blobs, almacén "black-wuuff-friday" (una por caja: "caja-01" … "caja-10").
const crypto = require('crypto');
const tienda = require('./tienda');
const CN = require('../../assets/collar-nombre.json');

const STORE = 'black-wuuff-friday';
const CONFIG = {
  inicio: '2026-11-27T00:00:00-05:00',   // se abren las cajas
  fin: '2026-11-30T00:00:00-05:00',      // válido del 27 al 29 de noviembre
  total: 10,
  precioCents: 9990000,                  // $99.900 (el combo completo vale $149.900)
  antesCents: 14990000,
  nombreExtraCents: 1500000,             // cajas #6 a #10: nombre en el collar +$15.000
  apartarMs: 10 * 60 * 1000              // la caja queda apartada 10 minutos
};
const TALLAS = ['S', 'M', 'SS', 'SM', 'MS', 'MM'];

// Regalo según el número de caja (el mismo texto lo usa la página)
function regaloDe(n) {
  if (n === 1) return { n, titulo: '¡Premio mayor! Collar con nombre + Placa Inteligente + stickers', corto: 'collar con nombre + Placa Inteligente + stickers', nombre: true, placa: true, stickers: true };
  if (n >= 2 && n <= 5) return { n, titulo: 'El nombre de tu perrito en su collar', corto: 'nombre en el collar', nombre: true };
  if (n >= 6 && n <= 8) return { n, titulo: 'Placa Inteligente Wuuff', corto: 'Placa Inteligente', placa: true, upsell: true };
  if (n >= 9 && n <= CONFIG.total) return { n, titulo: 'Pack de stickers de la pandilla Wuuff', corto: 'pack de stickers', stickers: true, upsell: true };
  return null;
}

// 'antes' | 'activa' | 'terminada'. BWF_ABRIR_YA=1 en Netlify abre la venta antes (para una compra de prueba).
function estadoVenta(ahora) {
  const t = ahora || Date.now();
  if (t >= Date.parse(CONFIG.fin)) return 'terminada';
  if (process.env.BWF_ABRIR_YA === '1') return 'activa';
  return t < Date.parse(CONFIG.inicio) ? 'antes' : 'activa';
}

const clave = n => 'caja-' + String(n).padStart(2, '0');
async function leerCaja(store, n) {
  const c = await store.get(clave(n), { type: 'json', consistency: 'strong' }).catch(() => null);
  return Object.assign({ n }, c || {});
}
async function leerCajas(store) {
  const out = [];
  for (let n = 1; n <= CONFIG.total; n++) out.push(await leerCaja(store, n));
  return out;
}
const vigente = (c, ahora) => c.estado === 'apartada' && Date.parse(c.hasta) > ahora;
// Ocupada para otro: pagada, o apartada (y vigente) con otro token
const ocupada = (c, ahora, token) => c.estado === 'pagada' || (vigente(c, ahora) && c.token !== token);

function resumen(cajas, ahora) {
  const vendidas = cajas.filter(c => c.estado === 'pagada').length;
  const apartadas = cajas.filter(c => vigente(c, ahora)).length;
  const libre = cajas.find(c => !ocupada(c, ahora, null));
  return { estado: estadoVenta(ahora), total: CONFIG.total, vendidas, quedan: CONFIG.total - vendidas, apartadas,
    siguiente: libre ? libre.n : null, inicio: CONFIG.inicio, fin: CONFIG.fin, ahora: new Date(ahora).toISOString(),
    precio: CONFIG.precioCents / 100, antes: CONFIG.antesCents / 100, nombreExtra: CONFIG.nombreExtraCents / 100 };
}

// Aparta la siguiente caja libre (o devuelve la que ya tiene este token). Escribe y vuelve a leer para confirmar que es suya.
async function apartar(store, tokenActual, ahora) {
  ahora = ahora || Date.now();
  const estado = estadoVenta(ahora);
  if (estado !== 'activa') return { error: estado === 'antes' ? 'Las cajas se abren el 27 de noviembre' : 'El Black Wuuff Friday ya terminó' };
  const token = /^[a-f0-9]{32}$/.test(String(tokenActual || '')) ? tokenActual : '';
  for (let intento = 0; intento < 4; intento++) {
    const cajas = await leerCajas(store);
    const mia = token && cajas.find(c => c.estado === 'apartada' && c.token === token && Date.parse(c.hasta) > ahora);
    if (mia) return { n: mia.n, token, hasta: mia.hasta, regalo: regaloDe(mia.n) };
    const libre = cajas.find(c => !ocupada(c, ahora, null));
    if (!libre) {
      const r = resumen(cajas, ahora);
      return r.quedan > 0 ? { error: 'Las cajas que quedan están apartadas. Intenta de nuevo en unos minutos.', apartadas: true } : { error: 'Se acabaron las cajas 🖤', agotada: true };
    }
    const nuevo = { estado: 'apartada', token: crypto.randomBytes(16).toString('hex'), hasta: new Date(ahora + CONFIG.apartarMs).toISOString(), creado: new Date(ahora).toISOString() };
    await store.setJSON(clave(libre.n), nuevo);
    const otra = await leerCaja(store, libre.n);
    if (otra.token === nuevo.token) return { n: libre.n, token: nuevo.token, hasta: nuevo.hasta, regalo: regaloDe(libre.n) };
  }
  return { error: 'Hay mucha gente comprando. Intenta de nuevo.' };
}

// Suelta la caja apartada (si el cliente cierra o se le acaba el tiempo)
async function soltar(store, n, token) {
  if (!regaloDe(n) || !token) return false;
  const c = await leerCaja(store, n);
  if (c.estado === 'apartada' && c.token === token) { await store.delete(clave(n)); return true; }
  return false;
}

// Total del pedido de una caja (lo usa wompi-signature). bwf = { n, token, talla, conNombre, nombre: { texto, color }, placa }
async function calcular(store, bwf, ciudad, ahora) {
  ahora = ahora || Date.now();
  const b = bwf && typeof bwf === 'object' ? bwf : {};
  const n = parseInt(b.n, 10), regalo = regaloDe(n);
  if (!regalo || !b.token) return { ok: false, error: 'Vuelve a la página del Black Wuuff Friday y aparta tu caja' };
  if (estadoVenta(ahora) === 'terminada') return { ok: false, error: 'El Black Wuuff Friday ya terminó' };
  const c = await leerCaja(store, n);
  if (c.estado === 'pagada' || (c.token !== b.token && vigente(c, ahora))) {
    return { ok: false, error: 'Tu caja #' + n + ' se liberó y la tomó otra persona. Vuelve a la página del Black Wuuff Friday para apartar otra.', cajaPerdida: true };
  }
  if (c.token !== b.token || !vigente(c, ahora)) {
    // Se le venció el tiempo pero nadie más la tomó: se le vuelve a apartar
    if (estadoVenta(ahora) !== 'activa') return { ok: false, error: 'Las cajas se abren el 27 de noviembre' };
    await store.setJSON(clave(n), { estado: 'apartada', token: b.token, hasta: new Date(ahora + CONFIG.apartarMs).toISOString(), creado: new Date(ahora).toISOString() });
  }
  let talla = String(b.talla || '').toUpperCase();
  if (talla.length === 2 && talla[0] === talla[1]) talla = talla[0];
  if (TALLAS.indexOf(talla) < 0) return { ok: false, error: 'Elige la talla' };
  const textoTalla = talla.length === 2 ? 'collar ' + talla[0] + ', arnés ' + talla[1] : talla;

  let subtotal = CONFIG.precioCents;
  const avisos = ['🖤 Black Wuuff Friday · Caja #' + n + ' · Regalo: ' + regalo.corto];
  let nombre = 'Combo completo (Talla ' + textoTalla + ') · Black Wuuff Friday caja #' + n;
  const conNombre = regalo.nombre || (regalo.upsell && !!b.conNombre);
  let personal = null;
  if (conNombre) {
    const cn = tienda.nombreCollar(b.nombre, 0);
    if (!cn || cn.error) return { ok: false, error: (cn && cn.error) || 'Escribe el nombre para el collar' };
    const extrasCents = cn.extras * CN.precioExtra * 100;
    subtotal += extrasCents + (regalo.nombre ? 0 : CONFIG.nombreExtraCents);
    nombre += ' · collar con nombre "' + cn.texto + '" · letras ' + (cn.detalle ? 'combinadas (' + cn.usados.join(', ') + ')' : cn.color) +
      (cn.extras ? ' · ' + cn.extras + (cn.extras === 1 ? ' letra extra' : ' letras extra') : '');
    avisos.push('✏️ Nombre: ' + cn.texto + ' · Letras: ' + (cn.detalle ? 'combinadas → ' + cn.detalle : cn.color) + ' · Talla collar ' + talla[0] + ' · Extras: ' + cn.extras +
      (regalo.nombre ? '' : ' (pagó el nombre +' + tienda.pesos(CONFIG.nombreExtraCents) + ')'));
    personal = Object.assign({ talla: talla[0] }, cn);
  }
  let placa = null;
  if (regalo.placa) {
    placa = tienda.placaValida(b.placa);
    if (!placa) return { ok: false, error: 'Completa los datos de la placa: nombre (máx. 10), forma y color' };
    nombre += ' + Placa Inteligente Wuuff ' + placa.forma + ' "' + placa.nombre + '" (placa ' + placa.base + (placa.letras ? ', letras ' + placa.letras : '') + ') [REGALO]';
    avisos.push('🏷️ Placa de regalo: "' + placa.nombre + '" · Forma: ' + placa.forma + ' · Placa ' + placa.base + (placa.letras ? ' · Letras ' + placa.letras : ''));
  }
  if (regalo.stickers) { nombre += ' + Pack de stickers Wuuff [REGALO]'; avisos.push('🎟️ Incluir el pack de stickers'); }
  const envio = tienda.envioCents(subtotal, ciudad, false);
  return { ok: true, n, regalo, talla, subtotalCents: subtotal, envioCents: envio, totalCents: subtotal + envio, nombreProducto: nombre, avisos,
    placa, personal, conNombre };
}

// Wompi aprobó el pago: la caja queda pagada. Devuelve { n } (o { n, cambio: apartada } / { sinCaja: true })
async function confirmar(store, bwf, ref, ahora) {
  ahora = ahora || Date.now();
  const n = parseInt(bwf && bwf.n, 10);
  const cajas = await leerCajas(store);
  const ya = cajas.find(c => c.estado === 'pagada' && c.ref === ref);
  if (ya) return { n: ya.n };   // Wompi avisa dos veces
  const pagar = async m => { await store.setJSON(clave(m), { estado: 'pagada', ref, pagada: new Date(ahora).toISOString() }); return m; };
  const suya = cajas.find(c => c.n === n);
  if (suya && suya.estado !== 'pagada' && (suya.token === (bwf && bwf.token) || !vigente(suya, ahora))) return { n: await pagar(n) };
  // Su caja ya la pagó otra persona: la siguiente libre (primero las que nadie tiene apartadas)
  const libre = cajas.find(c => !ocupada(c, ahora, null)) || cajas.find(c => c.estado !== 'pagada');
  if (!libre) return { sinCaja: true, apartada: n };
  return { n: await pagar(libre.n), cambio: n };
}

// Para la página al volver del pago: qué caja quedó con esta referencia
async function cajaDeRef(store, pedidos, ref) {
  const cajas = await leerCajas(store);
  const c = cajas.find(x => x.estado === 'pagada' && x.ref === ref);
  if (c) return { n: c.n, pagada: true, regalo: regaloDe(c.n) };
  const g = pedidos ? await pedidos.get(ref, { type: 'json' }).catch(() => null) : null;
  if (g && g.bwf && regaloDe(g.bwf.n)) return { n: g.bwf.n, pagada: false, regalo: regaloDe(g.bwf.n) };
  return null;
}

module.exports = { STORE, CONFIG, regaloDe, estadoVenta, leerCajas, resumen, apartar, soltar, calcular, confirmar, cajaDeRef };
