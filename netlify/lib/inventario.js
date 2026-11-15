// Inventario del panel (/panel/, pestaña 📦 Inventario).
// Lo que hay en bodega sale de:
//   - el último CONTEO de cada producto ("tengo 12"),
//   - más lo que LLEGÓ después (entradas),
//   - menos lo que SALIÓ después: pedidos enviados o entregados (ventas, colaboraciones o regalos, según el tipo del pedido)
//     y las salidas que se anotan a mano (colaboración, regalo, dañado o perdido).
// Los pedidos por confirmar, confirmados o preparando quedan "por despachar" (apartados, aún en bodega).
// Los movimientos se guardan en Netlify Blobs, almacén "panel-inventario" (uno por movimiento: "mov-…").
const crypto = require('crypto');

const STORE = 'panel-inventario';
const ITEMS = [
  { id: 'collar-S', nombre: 'Collar talla S' },
  { id: 'collar-M', nombre: 'Collar talla M' },
  { id: 'arnes-S', nombre: 'Arnés talla S' },
  { id: 'arnes-M', nombre: 'Arnés talla M' },
  { id: 'correa', nombre: 'Correa' },
  { id: 'placa', nombre: 'Placa Inteligente (chip NFC)' }
];
// Sin conteos: lo que hay = lo que llegó − lo que salió (como una hoja de cálculo). Los conteos viejos se ignoran.
const TIPOS_MOV = ['entrada', 'colaboracion', 'regalo', 'contenido', 'danado'];
const SALIDAS_MANUALES = ['colaboracion', 'regalo', 'contenido', 'danado']; // contenido = producto que se usa para fotos y videos
const TIPOS_PEDIDO = ['venta', 'colaboracion', 'regalo'];
const SALIO = ['enviado', 'entregado'];
const POR_DESPACHAR = ['por-confirmar', 'confirmado', 'preparando'];

function limpio(v, max) { return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200); }
function sinTildes(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

// ── Leer los productos de un pedido (texto de la web o del panel) → piezas del inventario ──
// "Combo completo (collar + arnés + correa) (Talla collar S, arnés M) + Placa … [REGALO]" → collar-S, arnes-M, correa, placa (regalo)
function piezasDeTexto(texto) {
  const piezas = [];
  let dudas = false;
  const sumar = (item, cantidad, regalo) => {
    const ya = piezas.find(p => p.item === item && !!p.regalo === !!regalo);
    if (ya) ya.cantidad += cantidad; else piezas.push(regalo ? { item, cantidad, regalo: true } : { item, cantidad });
  };
  String(texto || '').split(/\n/).forEach(linea => {
    // Lo que va después de " | " son datos del pedido (referencia, perfil NFC, nombres), no productos
    let t = sinTildes(linea.split(' | ')[0])
      .replace(/\(collar \+ arnes \+ correa\)/g, '')
      .replace(/\s*[—-]+\s*combo collar \+ placa/g, '')
      .replace(/combo arnes \+ correa|arnes \+ correa/g, '§ac')
      .replace(/combo collar \+ correa|collar con nombre \+ correa|collar \+ correa/g, '§cc');
    t.split(' + ').forEach(seg => {
      const s = seg.trim();
      if (!s) return;
      const regalo = /\[regalo\]/.test(s);
      const q = /\sx(\d{1,2})\b/.exec(s.replace(/\[[^\]]*\]/g, ''));
      const n = q ? Math.max(1, parseInt(q[1], 10)) : 1;
      const doble = /talla collar ([sm]),\s*arnes ([sm])/.exec(s), una = /talla ([sm])\b/.exec(s);
      const tc = doble ? doble[1].toUpperCase() : (una ? una[1].toUpperCase() : ''), ta = doble ? doble[2].toUpperCase() : tc;
      const conTalla = (base, talla) => { if (talla) sumar(base + '-' + talla, n); else dudas = true; };
      if (/^§ac/.test(s)) { conTalla('arnes', ta); sumar('correa', n); }
      else if (/^§cc/.test(s)) { conTalla('collar', tc); sumar('correa', n); }
      else if (/^combo completo/.test(s)) { conTalla('collar', tc); conTalla('arnes', ta); sumar('correa', n); }
      else if (/^combo/.test(s)) dudas = true;
      else if (/^arnes/.test(s)) conTalla('arnes', ta);
      else if (/^collar/.test(s)) conTalla('collar', tc);
      else if (/^correa/.test(s)) sumar('correa', n);
      else if (/^placa/.test(s)) sumar('placa', n, regalo);
    });
  });
  return { piezas, dudas };
}

// ── Letras del collar con nombre (por letra y color) ──
// Cada letra es un producto del inventario: "L-<color>-<letra>" (ej. L-rosado-A, L-lila-corazon, L-negro-estrella)
const CN = require('../../assets/collar-nombre.json');
const COLOR_IDS = CN.colores.map(c => c.id);
function codigoLetra(ch) { return ch === '♥' ? 'corazon' : (ch === '★' ? 'estrella' : ch); }
function idLetra(color, ch) { return 'L-' + color + '-' + codigoLetra(ch); }
function esLetra(id) {
  const m = /^L-([a-z]+)-([A-Z]|corazon|estrella)$/.exec(String(id || ''));
  return !!m && COLOR_IDS.includes(m[1]);
}
function colorPorNombre(t) { const n = sinTildes(t).trim(); const c = CN.colores.find(x => sinTildes(x.nombre) === n); return c ? c.id : ''; }
function piezasNombre(texto) {
  return Array.from(String(texto || '').toUpperCase()).map(ch => (ch === '♥' || ch === '★') ? ch : ch.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .filter(ch => /^[A-Z]$/.test(ch) || ch === '♥' || ch === '♥' || ch === '★');
}
// Letras que lleva un pedido: de 'collar con nombre "LUNA" … · letras Rosado' (o combinadas: el detalle va en las notas)
function letrasDePedido(p) {
  const out = [];
  let dudas = false;
  const sumar = (id, n) => { const ya = out.find(x => x.item === id); if (ya) ya.cantidad += n; else out.push({ item: id, cantidad: n }); };
  const txt = String((p && p.productos) || ''), notas = String((p && p.notas) || '');
  const re = /con nombre[^"\n]*"([^"\n]{1,12})"[^"\n]*?letras (combinadas|[^·+|(\[\n]+)/gi;
  let m;
  while ((m = re.exec(txt))) {
    const piezas = piezasNombre(m[1]), color = m[2].trim();
    if (!piezas.length) continue;
    if (!/^combinadas$/i.test(color)) {
      const id = colorPorNombre(color);
      if (!id) { dudas = true; continue; }
      piezas.forEach(ch => sumar(idLetra(id, ch), 1));
      continue;
    }
    // "✏️ Nombre: LUNA · Letras: combinadas → L Azul rey · U Azul rey · N Rosado · A Rosado · Talla S"
    const lin = notas.split('\n').find(l => l.indexOf('Nombre: ' + piezas.join('') + ' · Letras: combinadas →') > -1);
    if (!lin) { dudas = true; continue; }
    const detalle = lin.split('combinadas →')[1].split(' · ').map(x => x.trim()).filter(Boolean);
    let leidas = 0;
    detalle.forEach(par => {
      const mm = /^(\S)\s+(.+)$/.exec(par);
      if (!mm || /^(talla|extras)/i.test(par)) return;
      const id = colorPorNombre(mm[2]);
      if (id) { sumar(idLetra(id, mm[1]), 1); leidas++; }
    });
    if (leidas !== piezas.length) dudas = true;
  }
  return { letras: out, dudas };
}

// ── Movimientos ──
function nuevoId() { return 'mov-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'); }
// Fecha del movimiento: hoy → ahora mismo; otro día → mediodía de ese día
function fechaMov(f, ahora) {
  const hoy = new Date((ahora || Date.now()) - 5 * 36e5).toISOString().slice(0, 10);
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f) || f === hoy) return new Date(ahora || Date.now()).toISOString();
  return new Date(f + 'T12:00:00-05:00').toISOString();
}
// Cada guardado trae un "lote" (uno por formulario): el id sale del lote + el producto, así que si el mismo
// guardado llega dos veces (doble toque o reintento tras un error), se sobrescribe y no se suma dos veces.
function idMov(lote, item) {
  return /^[a-z0-9]{6,24}$/.test(String(lote || '')) ? 'mov-' + lote + '-' + item.toLowerCase().replace(/[^a-z0-9-]/g, '') : nuevoId();
}
function movimiento(d, itemsValidos, ahora) {
  if (!d || !TIPOS_MOV.includes(d.tipo) || !(itemsValidos.includes(d.item) || esLetra(d.item))) return null;
  const cantidad = parseInt(d.cantidad, 10);
  if (isNaN(cantidad) || cantidad < 0 || cantidad > 100000 || cantidad === 0) return null;
  return { id: idMov(d.lote, d.item), tipo: d.tipo, item: d.item, cantidad, fecha: fechaMov(d.fecha, ahora), nota: limpio(d.nota, 200),
    creado: new Date(ahora || Date.now()).toISOString() };
}
function idExtra(nombre) {
  const s = sinTildes(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return s ? 'x-' + s : '';
}

// ── El cálculo (como una hoja de cálculo), por producto:
//   Llegó − Vendidos − Colaboración − Regalos − Contenido − Dañados = Quedan;   Quedan − Por despachar = Disponibles
// Vendidos/colaboración/regalos salen de los pedidos ENVIADOS o ENTREGADOS (según su tipo); los por confirmar,
// confirmados o preparando quedan "por despachar". Las salidas que se anotan a mano suman a su columna.
const COLUMNAS = ['venta', 'colaboracion', 'regalo', 'contenido', 'danado'];
function fila(id, extra) { return Object.assign({ id, llego: 0, venta: 0, colaboracion: 0, regalo: 0, contenido: 0, danado: 0, porDespachar: 0 }, extra || {}); }
function calcular(pedidos, movimientos, extras) {
  const items = ITEMS.concat(extras || []);
  const porItem = Object.fromEntries(items.map(it => [it.id, fila(it.id, { nombre: it.nombre, extra: !it.id.indexOf('x-') })]));
  // Las letras se crean a medida que tienen movimientos o pedidos (son 10 colores × 28 letras)
  const asegurar = id => { if (!porItem[id] && esLetra(id)) porItem[id] = fila(id, { letra: true }); return porItem[id]; };
  const salidas = [];
  (movimientos || []).forEach(m => {
    const r = asegurar(m.item); if (!r) return;
    if (m.tipo === 'entrada') r.llego += m.cantidad;
    else if (COLUMNAS.includes(m.tipo)) {
      r[m.tipo] += m.cantidad;
      salidas.push({ fecha: m.fecha, item: m.item, tipo: m.tipo, cantidad: m.cantidad, nota: m.nota, origen: 'manual', mov: m.id });
    }
  });

  const sinLeer = [], letrasSinLeer = [], apartados = [];
  (pedidos || []).filter(p => p && !p.borrado && (SALIO.includes(p.estado) || POR_DESPACHAR.includes(p.estado))).forEach(p => {
    const { piezas, dudas } = piezasDeTexto(p.productos);
    if (!piezas.length || dudas) sinLeer.push({ id: p.id, cliente: (p.cliente && p.cliente.nombre) || '', productos: String(p.productos || '').split(' | ')[0].slice(0, 160) });
    const tipo = TIPOS_PEDIDO.includes(p.tipo) ? p.tipo : 'venta';
    const fecha = p.enviado || p.entregado || p.creado || '';
    const pendiente = POR_DESPACHAR.includes(p.estado);
    const ls = letrasDePedido(p);
    if (ls.dudas) letrasSinLeer.push({ id: p.id, cliente: (p.cliente && p.cliente.nombre) || '', productos: String(p.productos || '').split(' | ')[0].slice(0, 160) });
    ls.letras.forEach(l => { const r = asegurar(l.item); if (!r) return; if (pendiente) r.porDespachar += l.cantidad; else r[tipo] += l.cantidad; });
    piezas.forEach(pz => {
      const r = porItem[pz.item]; if (!r) return;
      const detalle = { item: pz.item, cantidad: pz.cantidad, pedido: p.id, cliente: (p.cliente && p.cliente.nombre) || '', estado: p.estado, productos: String(p.productos || '').split(' | ')[0].slice(0, 160) };
      if (pendiente) { r.porDespachar += pz.cantidad; apartados.push(Object.assign({ fecha: p.creado || '' }, detalle)); return; }
      const t = pz.regalo ? 'regalo' : tipo;
      r[t] += pz.cantidad;
      salidas.push(Object.assign({ fecha, tipo: t, origen: 'pedido' }, detalle));
    });
  });
  const cerrar = r => { r.salio = COLUMNAS.reduce((n, k) => n + r[k], 0); r.bodega = r.llego - r.salio; r.disponible = r.bodega - r.porDespachar; return r; };
  const lista = items.map(it => cerrar(porItem[it.id]));
  const letras = Object.values(porItem).filter(r => r.letra).map(cerrar);
  return { items: lista, letras, apartados, salidas: salidas.filter(s => !esLetra(s.item)), sinLeer: sinLeer.slice(0, 30), letrasSinLeer: letrasSinLeer.slice(0, 30),
    conDatos: lista.some(r => r.llego > 0) };
}

// Une la lista del almacén con lo que el panel guardó o borró hace poco (la lista puede tardar en mostrarlo).
function fusionar(movimientos, recientes, borrados) {
  const fuera = new Set((Array.isArray(borrados) ? borrados : []).map(String).filter(id => /^mov-[a-z0-9-]{4,60}$/.test(id)).slice(0, 500));
  const lista = movimientos.filter(m => !fuera.has(m.id));
  const ya = new Set(lista.map(m => m.id));
  (Array.isArray(recientes) ? recientes : []).slice(0, 300).forEach(m => {
    if (!m || !/^mov-[a-z0-9-]{4,60}$/.test(String(m.id)) || ya.has(m.id) || fuera.has(m.id)) return;
    if (!TIPOS_MOV.includes(m.tipo) || !(ITEMS.some(x => x.id === m.item) || esLetra(m.item) || /^x-[a-z0-9-]{1,40}$/.test(String(m.item)))) return;
    const cantidad = parseInt(m.cantidad, 10);
    if (!(cantidad > 0 && cantidad <= 100000) || isNaN(Date.parse(m.fecha))) return;
    lista.push({ id: m.id, tipo: m.tipo, item: m.item, cantidad, fecha: new Date(m.fecha).toISOString(), nota: limpio(m.nota, 200), creado: new Date(Date.parse(m.creado) || Date.now()).toISOString() });
    ya.add(m.id);
  });
  return lista;
}

// Todos los movimientos viven en UN solo registro ("movimientos"): una sola lectura, mucho más rápido.
// (Antes había uno por movimiento, "mov-…": la primera vez se pasan solos a este registro y se borran.)
async function leer(store) {
  const [doc, extras] = await Promise.all([
    store.get('movimientos', { type: 'json' }).catch(() => null),
    store.get('extras', { type: 'json' }).catch(() => null)
  ]);
  let movs = doc && Array.isArray(doc.movs) ? doc.movs : null;
  if (!movs) {
    const { blobs } = await store.list();
    const viejos = blobs.filter(b => b.key.indexOf('mov-') === 0);
    movs = (await Promise.all(viejos.map(b => store.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    await store.setJSON('movimientos', { v: 2, movs });
    await Promise.all(viejos.map(b => store.delete(b.key).catch(() => null)));
  }
  return { movimientos: movs, extras: Array.isArray(extras) ? extras : [] };
}
async function guardarMovimientos(store, movs) {
  await store.setJSON('movimientos', { v: 2, actualizado: new Date().toISOString(), movs });
}

module.exports = { fusionar, COLUMNAS, letrasDePedido, idLetra, esLetra, STORE, ITEMS, TIPOS_MOV, idMov, TIPOS_PEDIDO, piezasDeTexto, movimiento, idExtra, calcular, leer, guardarMovimientos, limpio };
