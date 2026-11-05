// Reglas de la tienda en el servidor: precios, combos, envío y códigos de descuento.
// Las usan wompi-signature, pedido-contraentrega, validar-codigo y wompi-webhook,
// para que el total SIEMPRE se calcule aquí y nunca se tome el que manda el navegador.
// Si cambian los precios de la web, cámbialos también aquí (en centavos).
const PRODUCTOS = {
  // Combos
  // Combo: talla del collar y del arnés por separado ("SM" = collar S, arnés M); "S" o "M" = las dos iguales
  combo:          { nombre: 'Combo completo (collar + arnés + correa)', cents: 14990000, tallas: ['S', 'M', 'SS', 'SM', 'MS', 'MM'] },
  'arnes-correa': { nombre: 'Combo arnés + correa', cents: 10990000, tallas: ['S', 'M'] },
  'collar-correa': { nombre: 'Combo collar + correa', cents: 8990000, tallas: ['S', 'M'] },
  // Piezas sueltas
  arnes:  { nombre: 'Arnés tipo H impermeable', cents: 6990000, tallas: ['S', 'M'] },
  collar: { nombre: 'Collar impermeable', cents: 4490000, tallas: ['S', 'M'] },
  correa: { nombre: 'Correa impermeable', cents: 5990000, tallas: ['Única'] }
};
const PLACA_SOLA = 2990000;          // $29.900
const PLACA_AGREGADA = 1990000;      // $19.900 al llevarla con arnés, arnés + correa, collar + correa o combo completo
const COMBO_COLLAR_PLACA = 6490000;  // $64.900 collar + placa (la placa queda en $20.000)
const CON_PLACA_AGREGADA = ['arnes', 'arnes-correa', 'collar-correa', 'combo'];
const ENVIO_MINIMO_GRATIS = 4990000; // Bogotá/Soacha gratis desde $49.900 (subtotal ANTES del descuento)
const ENVIO_BOGOTA_PEQUENO = 850000; // $8.500 para collares, la placa y pedidos menores, solo con Wompi
const ENVIO_OTRAS = 1850000;         // $18.500 otras ciudades

// Collar con nombre: precios y colores en assets/collar-nombre.json (el mismo archivo que usa la página)
const CN = require('../../assets/collar-nombre.json');

const FORMAS = ['Huella', 'Gato', 'Nombre'];
const COLORES = ['Morado', 'Azul', 'Blanco', 'Rojo'];

// Concurso #WuuffHalloween: códigos personales en la variable de entorno CODIGOS_CONCURSO
// (JSON código → participante, o código → { "participante": "...", "vence": "2026-11-01T00:00:00-05:00" }).
// 10 % en toda la tienda (sin el envío) y placa de regalo si el carrito tiene arnés + correa o combo completo.
const CONCURSO_PORCENTAJE = 10;
const CONCURSO_VENCE = '2026-11-03T00:00:00-05:00'; // válido hasta el 2 de noviembre, 11:59 p. m. (Colombia)

const MENSAJES = {
  aplicadoRegalo: 'Código aplicado: 10 % + placa de regalo 🎁',
  aplicado: 'Código aplicado: 10 % de descuento',
  noExiste: 'Este código no existe',
  usado: 'Este código ya se usó',
  vencido: 'Este código venció el 2 de noviembre'
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

// Nombre del collar: solo A–Z, corazón y estrella; las tildes se quitan (José → JOSE) y la Ñ no existe
function nombreCollar(n) {
  if (!n || typeof n !== 'object') return null;
  const crudo = Array.from(String(n.texto || '').toUpperCase());
  if (crudo.indexOf('Ñ') > -1) return { error: 'La Ñ todavía no la tenemos para el collar con nombre' };
  const piezas = [];
  for (const ch of crudo) {
    const b = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/^[A-Z]$/.test(b)) piezas.push(b); else if (ch === '♥' || ch === '★') piezas.push(ch);
  }
  if (!piezas.length) return { error: 'Escribe el nombre para el collar' };
  if (piezas.length > CN.maximo) return { error: 'El collar lleva máximo ' + CN.maximo + ' letras' };
  const color = CN.colores.find(c => c.id === n.color);
  if (!color) return { error: 'Elige el color de las letras' };
  const peso = CN.pesos.find(p => p.id === n.peso) || null;
  const extras = Math.max(0, piezas.length - CN.incluidas);
  return { texto: piezas.join(''), color: color.nombre, peso: peso ? peso.txt : '', extras, cents: (CN.precio + extras * CN.precioExtra) * 100 };
}

// carrito = { items: [{ p: 'collar', talla: 'S', qty: 1, nombre: { texto, color, peso } }], placa: { nombre, forma, base, letras } }
function armar(carrito) {
  const c = carrito && typeof carrito === 'object' ? carrito : {};
  const items = Array.isArray(c.items) ? c.items.slice(0, 6) : [];
  const lineas = [];
  for (const it of items) {
    const prod = PRODUCTOS[it && it.p];
    if (!prod) return { error: 'Producto no válido' };
    const qty = Math.min(Math.max(parseInt(it.qty, 10) || 1, 1), 10);
    const talla = elegir(it.talla, prod.tallas);
    const textoTalla = talla.length === 2 ? 'collar ' + talla[0] + ', arnés ' + talla[1] : (talla === 'Única' ? 'única' : talla);
    if (it.p === 'collar' && it.nombre) {
      const cn = nombreCollar(it.nombre);
      if (!cn || cn.error) return { error: (cn && cn.error) || 'Revisa el nombre del collar' };
      if (!talla) return { error: 'Elige la talla del collar' };
      lineas.push({ tipo: 'producto', clave: 'collar', personal: Object.assign({ talla }, cn), cents: cn.cents,
        nombre: 'Collar con nombre "' + cn.texto + '" (Talla ' + talla + ') · letras ' + cn.color + (cn.extras ? ' · ' + cn.extras + (cn.extras === 1 ? ' letra extra' : ' letras extra') : '') });
      continue;
    }
    const nombre = prod.nombre + (talla ? ' (Talla ' + textoTalla + ')' : '') + (qty > 1 ? ' x' + qty : '');
    lineas.push({ tipo: 'producto', clave: it.p, nombre, cents: prod.cents * qty });
  }
  const claves = lineas.map(l => l.clave);
  let placa = null;
  if (c.placa) {
    placa = placaValida(c.placa);
    if (!placa) return { error: 'Faltan datos de la placa' };
    let cents = PLACA_SOLA, nombre = nombrePlaca(placa);
    if (claves.some(k => CON_PLACA_AGREGADA.indexOf(k) > -1)) {
      cents = PLACA_AGREGADA;
    } else if (claves.indexOf('collar') > -1) {
      // Combo collar + placa: $64.900 en total
      cents = COMBO_COLLAR_PLACA - PRODUCTOS.collar.cents;
      nombre += ' — combo Collar + Placa';
    }
    lineas.push({ tipo: 'placa', nombre, cents });
  }
  if (!lineas.length) return { error: 'El carrito está vacío' };
  const subtotalCents = lineas.reduce((s, l) => s + l.cents, 0);
  // Placa de regalo del concurso: con arnés + correa (combo o por separado) o combo completo
  const conRegalo = claves.indexOf('combo') > -1 || claves.indexOf('arnes-correa') > -1 ||
    (claves.indexOf('arnes') > -1 && claves.indexOf('correa') > -1);
  return { lineas, placa, subtotalCents, conRegalo };
}

function esBogota(ciudad) { return /bogot|soacha/i.test(String(ciudad || '')); }
// Collares (con o sin nombre) y la placa, solos o juntos, no tienen envío gratis ni contraentrega (nov 2026)
function soloCollarOPlaca(armado) {
  return !!armado && armado.lineas.every(l => l.tipo === 'placa' || l.clave === 'collar');
}
function envioCents(subtotalCents, ciudad, soloLinea) {
  if (!ciudad) return 0;
  if (esBogota(ciudad)) return subtotalCents >= ENVIO_MINIMO_GRATIS && !soloLinea ? 0 : ENVIO_BOGOTA_PEQUENO;
  return ENVIO_OTRAS;
}
// Contraentrega: solo Bogotá (no Soacha), desde $49.900 ANTES del descuento y sin ser solo collar o placa
function contraentregaPermitida(subtotalCents, ciudad, soloLinea) {
  return /bogot/i.test(String(ciudad || '')) && !/soacha/i.test(String(ciudad || '')) && subtotalCents >= ENVIO_MINIMO_GRATIS && !soloLinea;
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

// Valor de la placa que queda de regalo (la del carrito, si ya trae una; si no, se agrega una de $0)
function regaloDe(armado) {
  if (!armado.conRegalo) return 0;
  const placa = armado.lineas.find(l => l.tipo === 'placa');
  return placa ? placa.cents : 0;
}
function descuentoDe(armado) {
  return Math.round((armado.subtotalCents - regaloDe(armado)) * CONCURSO_PORCENTAJE / 100 / 100) * 100; // al peso
}

// Revisa un código contra el carrito. `usado(codigo)` es una función async que dice si ya se usó.
async function revisarCodigo(texto, armado, opciones) {
  const o = opciones || {};
  const ahora = o.ahora ? new Date(o.ahora) : new Date();
  const codigo = normalizarCodigo(texto);
  if (!codigo) return { valido: false, vacio: true };
  const lista = codigosConcurso();
  const dato = lista[codigo];
  if (!dato) return { valido: false, mensaje: MENSAJES.noExiste };
  const participante = typeof dato === 'string' ? dato : String(dato.participante || '');
  const vence = (dato && typeof dato === 'object' && dato.vence) || CONCURSO_VENCE;
  if (ahora >= new Date(vence)) return { valido: false, mensaje: MENSAJES.vencido };
  if (o.usado && await o.usado(codigo)) return { valido: false, mensaje: MENSAJES.usado };
  const regalo = armado.conRegalo;
  return { valido: true, codigo, tipo: 'concurso', participante, regalo, descuentoCents: descuentoDe(armado),
    regaloCents: regaloDe(armado), mensaje: regalo ? MENSAJES.aplicadoRegalo : MENSAJES.aplicado };
}

// Total del pedido calculado en el servidor.
// datos = { carrito, ciudad, codigo, regalo: { nombre, forma, color } }
async function calcular(datos, opciones) {
  const armado = armar(datos && datos.carrito);
  if (armado.error) return { ok: false, error: armado.error };
  const soloLinea = soloCollarOPlaca(armado);
  const envio = envioCents(armado.subtotalCents, datos.ciudad, soloLinea);
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
    envioCents: envio,
    descuentoCents: descuento,
    regaloCents,
    totalCents,
    nombreProducto,
    codigo: cod ? { codigo: cod.codigo, tipo: cod.tipo, participante: cod.participante, porcentaje: CONCURSO_PORCENTAJE } : null,
    regalo: regaloPlaca ? { texto: regaloTexto, placa: regaloPlaca } : null,
    contraentrega: contraentregaPermitida(armado.subtotalCents, datos.ciudad, soloLinea)
  };
}

// Líneas para los avisos a la tienda (correo y WhatsApp)
function lineasAviso(calc) {
  if (!calc) return [];
  const nombres = (calc.lineas || []).filter(x => x.personal).map(x => '✏️ Nombre: ' + x.personal.texto + ' · Letras: ' + x.personal.color +
    ' · Talla ' + x.personal.talla + (x.personal.peso ? ' (' + x.personal.peso.toLowerCase() + ')' : '') + ' · Extras: ' + x.personal.extras);
  if (!calc.codigo) return nombres;
  const l = nombres.concat(['🎃 Código concurso: ' + calc.codigo.codigo + (calc.codigo.participante ? ' (' + calc.codigo.participante + ')' : ''),
    'Descuento: −' + pesos(calc.descuentoCents) + ' (' + calc.codigo.porcentaje + ' %)']);
  if (calc.regalo) l.push('🎁 Placa de regalo: ' + calc.regalo.texto);
  return l;
}

module.exports = { PRODUCTOS, MENSAJES, armar, calcular, revisarCodigo, envioCents, contraentregaPermitida, normalizarCodigo, lineasAviso, pesos, placaValida };
