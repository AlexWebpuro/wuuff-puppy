// Reglas de la tienda en el servidor: precios, envío y códigos de descuento.
// Las usan wompi-signature, pedido-contraentrega, validar-codigo y wompi-webhook,
// para que el total SIEMPRE se calcule aquí y nunca se tome el que manda el navegador.
// Si cambian los precios de la web, cámbialos también aquí (en centavos).
const PRODUCTOS = {
  collar: { nombre: 'Collar impermeable', cents: 4990000, tallas: ['S', 'M'] },
  arnes:  { nombre: 'Arnés tipo H impermeable', cents: 7290000, tallas: ['S', 'M'] },
  correa: { nombre: 'Correa impermeable', cents: 5890000, tallas: ['Única'] },
  combo:  { nombre: 'Combo completo', cents: 15790000, tallas: ['S', 'M'] }
};
const PLACA_SOLA = 3490000;          // $34.900
const PLACA_CON_PRODUCTO = 2490000;  // $24.900 con collar, arnés o combo
const ENVIO_MINIMO_GRATIS = 4990000; // Bogotá/Soacha gratis desde $49.900 (subtotal ANTES del descuento)
const ENVIO_BOGOTA_PEQUENO = 800000; // $8.000 para pedidos menores (la placa sola)
const ENVIO_OTRAS = 1850000;         // $18.500 otras ciudades

const FORMAS = ['Huella', 'Gato', 'Nombre'];
const COLORES = ['Morado', 'Azul', 'Blanco', 'Rojo'];

// Concurso #WuuffHalloween: códigos personales en la variable de entorno CODIGOS_CONCURSO
// (JSON código → participante, o código → { "participante": "...", "vence": "2026-11-01T00:00:00-05:00" }).
const CONCURSO_PORCENTAJE = 15;
const CONCURSO_VENCE = '2026-11-16T00:00:00-05:00'; // válido hasta el 15 de noviembre, 11:59 p. m. (Colombia)

// Código general de Halloween (ya anunciado en la web): 10 % en el combo completo, 26 oct – 2 nov.
const HALLOWEEN = { codigo: 'WUUFFHALLOWEEN', desde: '2026-10-26T00:00:00-05:00', hasta: '2026-11-03T00:00:00-05:00', descuentoCents: 1579000 };

const MENSAJES = {
  aplicado: 'Código aplicado: 15 % + placa de regalo 🎁',
  noExiste: 'Este código no existe',
  usado: 'Este código ya se usó',
  vencido: 'Este código venció el 15 de noviembre',
  noAplica: 'El código aplica al comprar collar, correa, arnés o combo'
};

function pesos(cents) { return '$' + Math.round(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function limpio(v, max) { return String(v == null ? '' : v).replace(/[<>|\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function normalizarCodigo(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
function elegir(v, lista) { const x = lista.find(o => o.toLowerCase() === String(v || '').trim().toLowerCase()); return x || ''; }

// Placa (de la página de la placa o de regalo): nombre (máx. 10), forma y color
function placaValida(p) {
  if (!p || typeof p !== 'object') return null;
  const nombre = limpio(p.nombre, 10).replace(/[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü '\-.&]/g, '');
  const forma = elegir(p.forma, FORMAS), base = elegir(p.base || p.color, COLORES);
  const letras = p.letras ? elegir(p.letras, COLORES) : '';
  if (!nombre || !forma || !base) return null;
  return { nombre, forma, base, letras };
}
function nombrePlaca(p) {
  return 'Placa Inteligente Wuuff ' + p.forma + ' "' + p.nombre + '" (placa ' + p.base + (p.letras ? ', letras ' + p.letras : '') + ')';
}

// carrito = { items: [{ p: 'collar', talla: 'S', qty: 1 }], placa: { nombre, forma, base, letras } }
function armar(carrito) {
  const c = carrito && typeof carrito === 'object' ? carrito : {};
  const items = Array.isArray(c.items) ? c.items.slice(0, 6) : [];
  const lineas = [];
  let productosCents = 0;
  for (const it of items) {
    const prod = PRODUCTOS[it && it.p];
    if (!prod) return { error: 'Producto no válido' };
    const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 10);
    const talla = elegir(it.talla, prod.tallas);
    const nombre = prod.nombre + (talla ? ' (Talla ' + (talla === 'Única' ? 'única' : talla) + ')' : '') + (qty > 1 ? ' x' + qty : '');
    lineas.push({ tipo: 'producto', clave: it.p, nombre, cents: prod.cents * qty });
    productosCents += prod.cents * qty;
  }
  let placa = null;
  if (c.placa) {
    placa = placaValida(c.placa);
    if (!placa) return { error: 'Faltan datos de la placa' };
    const cents = lineas.length ? PLACA_CON_PRODUCTO : PLACA_SOLA;
    lineas.push({ tipo: 'placa', nombre: nombrePlaca(placa), cents });
  }
  if (!lineas.length) return { error: 'El carrito está vacío' };
  const subtotalCents = lineas.reduce((s, l) => s + l.cents, 0);
  return { lineas, placa, productosCents, subtotalCents, tieneProducto: productosCents > 0 };
}

function esBogota(ciudad) { return /bogot|soacha/i.test(String(ciudad || '')); }
function envioCents(subtotalCents, ciudad) {
  if (!ciudad) return 0;
  if (esBogota(ciudad)) return subtotalCents >= ENVIO_MINIMO_GRATIS ? 0 : ENVIO_BOGOTA_PEQUENO;
  return ENVIO_OTRAS;
}
// Contraentrega: solo Bogotá (no Soacha) y desde $49.900 ANTES del descuento
function contraentregaPermitida(subtotalCents, ciudad) {
  return /bogot/i.test(String(ciudad || '')) && !/soacha/i.test(String(ciudad || '')) && subtotalCents >= ENVIO_MINIMO_GRATIS;
}

function codigosConcurso() {
  try {
    const j = JSON.parse(process.env.CODIGOS_CONCURSO || '{}');
    const out = {};
    Object.keys(j).forEach(k => { out[normalizarCodigo(k)] = j[k]; });
    return out;
  } catch (err) {
    console.error('CODIGOS_CONCURSO no es un JSON válido', err.message);
    return {};
  }
}

// Revisa un código contra el carrito. `usado(codigo)` es una función async que dice si ya se usó.
async function revisarCodigo(texto, armado, opciones) {
  const o = opciones || {};
  const ahora = o.ahora ? new Date(o.ahora) : new Date();
  const codigo = normalizarCodigo(texto);
  if (!codigo) return { valido: false, vacio: true };

  if (codigo === HALLOWEEN.codigo) {
    if (ahora < new Date(HALLOWEEN.desde)) return { valido: false, mensaje: 'Este código se puede usar del 26 de octubre al 2 de noviembre de 2026.' };
    if (ahora >= new Date(HALLOWEEN.hasta)) return { valido: false, mensaje: 'Este código ya venció: era válido hasta el 2 de noviembre de 2026.' };
    const combo = armado.lineas.find(l => l.clave === 'combo');
    if (!combo) return { valido: false, mensaje: 'Este código aplica solo al combo completo (collar + arnés tipo H + correa).' };
    return { valido: true, codigo, tipo: 'halloween', participante: '', regalo: false, descuentoCents: HALLOWEEN.descuentoCents,
      mensaje: '✅ Código aplicado: 10 % en el combo completo (−' + pesos(HALLOWEEN.descuentoCents) + ').' };
  }

  const lista = codigosConcurso();
  const dato = lista[codigo];
  if (!dato) return { valido: false, mensaje: MENSAJES.noExiste };
  const participante = typeof dato === 'string' ? dato : String(dato.participante || '');
  const vence = (dato && typeof dato === 'object' && dato.vence) || CONCURSO_VENCE;
  if (ahora >= new Date(vence)) return { valido: false, mensaje: MENSAJES.vencido };
  if (!armado.tieneProducto) return { valido: false, mensaje: MENSAJES.noAplica };
  if (o.usado && await o.usado(codigo)) return { valido: false, mensaje: MENSAJES.usado };
  const descuentoCents = Math.round(armado.productosCents * CONCURSO_PORCENTAJE / 100 / 100) * 100; // al peso
  return { valido: true, codigo, tipo: 'concurso', participante, regalo: true, descuentoCents, mensaje: MENSAJES.aplicado };
}

// Total del pedido calculado en el servidor.
// datos = { carrito, ciudad, codigo, regalo: { nombre, forma, color } }
async function calcular(datos, opciones) {
  const armado = armar(datos && datos.carrito);
  if (armado.error) return { ok: false, error: armado.error };
  const envio = envioCents(armado.subtotalCents, datos.ciudad);
  let cod = null;
  if (normalizarCodigo(datos.codigo)) {
    cod = await revisarCodigo(datos.codigo, armado, opciones);
    if (!cod.valido) return { ok: false, error: cod.mensaje, codigoInvalido: true };
  }
  const descuento = cod ? cod.descuentoCents : 0;
  let regaloCents = 0, regaloPlaca = null, regaloTexto = '';
  if (cod && cod.regalo) {
    const placaPagada = armado.lineas.find(l => l.tipo === 'placa');
    if (placaPagada) {
      // Ya trae una placa en el pedido: esa es la de regalo (1 por pedido)
      regaloCents = placaPagada.cents;
      placaPagada.regalo = true;
      regaloPlaca = armado.placa;
    } else {
      regaloPlaca = placaValida(datos.regalo);
      if (!regaloPlaca) return { ok: false, error: 'Completa los datos de la placa de regalo: nombre (máx. 10), forma y color', faltaRegalo: true };
      armado.lineas.push({ tipo: 'placa', regalo: true, nombre: nombrePlaca(regaloPlaca), cents: 0 });
    }
    regaloTexto = '"' + regaloPlaca.nombre + '" · Forma: ' + regaloPlaca.forma + ' · Color: ' + regaloPlaca.base;
  }
  const totalCents = armado.subtotalCents - descuento - regaloCents + envio;
  const nombreProducto = armado.lineas.map(l => l.nombre + (l.regalo ? ' [REGALO]' : '')).join(' + ') +
    (cod ? ' [Código ' + cod.codigo + (cod.participante ? ' ' + cod.participante : '') + ': -' + pesos(descuento) + ']' : '');
  return {
    ok: true,
    lineas: armado.lineas,
    subtotalCents: armado.subtotalCents,
    productosCents: armado.productosCents,
    envioCents: envio,
    descuentoCents: descuento,
    regaloCents,
    totalCents,
    nombreProducto,
    codigo: cod ? { codigo: cod.codigo, tipo: cod.tipo, participante: cod.participante, porcentaje: cod.tipo === 'concurso' ? CONCURSO_PORCENTAJE : 10 } : null,
    regalo: regaloPlaca ? { texto: regaloTexto, placa: regaloPlaca } : null,
    contraentrega: contraentregaPermitida(armado.subtotalCents, datos.ciudad)
  };
}

// Líneas para los avisos a la tienda (correo y WhatsApp)
function lineasAviso(calc) {
  if (!calc || !calc.codigo) return [];
  const l = ['🎃 Código concurso: ' + calc.codigo.codigo + (calc.codigo.participante ? ' (' + calc.codigo.participante + ')' : ''),
    'Descuento: −' + pesos(calc.descuentoCents) + ' (' + calc.codigo.porcentaje + ' %)'];
  if (calc.regalo) l.push('🎁 Placa de regalo: ' + calc.regalo.texto);
  return l;
}

module.exports = { PRODUCTOS, MENSAJES, armar, calcular, revisarCodigo, envioCents, contraentregaPermitida, normalizarCodigo, lineasAviso, pesos, placaValida };
