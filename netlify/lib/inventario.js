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
const TIPOS_MOV = ['conteo', 'entrada', 'colaboracion', 'regalo', 'danado'];
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

// ── Movimientos ──
function nuevoId() { return 'mov-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'); }
// Fecha del movimiento: hoy → ahora mismo (así un conteo de hoy cuenta lo que ya salió hoy); otro día → mediodía de ese día
function fechaMov(f, ahora) {
  const hoy = new Date((ahora || Date.now()) - 5 * 36e5).toISOString().slice(0, 10);
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f) || f === hoy) return new Date(ahora || Date.now()).toISOString();
  return new Date(f + 'T12:00:00-05:00').toISOString();
}
function movimiento(d, itemsValidos, ahora) {
  if (!d || !TIPOS_MOV.includes(d.tipo) || !itemsValidos.includes(d.item)) return null;
  const cantidad = parseInt(d.cantidad, 10);
  if (isNaN(cantidad) || cantidad < 0 || cantidad > 100000 || (d.tipo !== 'conteo' && cantidad === 0)) return null;
  return { id: nuevoId(), tipo: d.tipo, item: d.item, cantidad, fecha: fechaMov(d.fecha, ahora), nota: limpio(d.nota, 200),
    creado: new Date(ahora || Date.now()).toISOString() };
}
function idExtra(nombre) {
  const s = sinTildes(nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return s ? 'x-' + s : '';
}

// ── El cálculo: bodega, por despachar, disponibles y todas las salidas (para el resumen por mes) ──
function calcular(pedidos, movimientos, extras) {
  const items = ITEMS.concat(extras || []);
  const porItem = Object.fromEntries(items.map(it => [it.id, { id: it.id, nombre: it.nombre, extra: !it.id.indexOf('x-'), conteo: null, bodega: 0, porDespachar: 0 }]));
  const movs = (movimientos || []).filter(m => porItem[m.item]).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.creado < b.creado ? -1 : 1)));
  movs.filter(m => m.tipo === 'conteo').forEach(m => { porItem[m.item].conteo = { cantidad: m.cantidad, fecha: m.fecha }; });
  const despues = (it, fecha) => !porItem[it].conteo || fecha > porItem[it].conteo.fecha;
  Object.values(porItem).forEach(r => { r.bodega = r.conteo ? r.conteo.cantidad : 0; });

  const salidas = [];
  movs.forEach(m => {
    if (m.tipo === 'conteo' || !despues(m.item, m.fecha)) return;
    porItem[m.item].bodega += m.tipo === 'entrada' ? m.cantidad : -m.cantidad;
  });
  movs.filter(m => ['colaboracion', 'regalo', 'danado'].includes(m.tipo)).forEach(m => salidas.push({ fecha: m.fecha, item: m.item, tipo: m.tipo, cantidad: m.cantidad, nota: m.nota, origen: 'manual' }));

  const sinLeer = [];
  (pedidos || []).filter(p => p && !p.borrado && (SALIO.includes(p.estado) || POR_DESPACHAR.includes(p.estado))).forEach(p => {
    const { piezas, dudas } = piezasDeTexto(p.productos);
    if (!piezas.length || dudas) sinLeer.push({ id: p.id, cliente: (p.cliente && p.cliente.nombre) || '', productos: String(p.productos || '').split(' | ')[0].slice(0, 160) });
    const tipo = TIPOS_PEDIDO.includes(p.tipo) ? p.tipo : 'venta';
    const fecha = p.enviado || p.entregado || p.creado || '';
    piezas.forEach(pz => {
      if (!porItem[pz.item]) return;
      if (POR_DESPACHAR.includes(p.estado)) { porItem[pz.item].porDespachar += pz.cantidad; return; }
      if (despues(pz.item, fecha)) porItem[pz.item].bodega -= pz.cantidad;
      salidas.push({ fecha, item: pz.item, tipo: pz.regalo ? 'regalo' : tipo, cantidad: pz.cantidad, origen: 'pedido', pedido: p.id, cliente: (p.cliente && p.cliente.nombre) || '' });
    });
  });
  const lista = items.map(it => { const r = porItem[it.id]; r.disponible = r.bodega - r.porDespachar; return r; });
  return { items: lista, salidas, sinLeer: sinLeer.slice(0, 30), conConteo: lista.some(r => r.conteo) };
}

// Lee todo el almacén: movimientos y productos extra (los que agrega Angie, ej. "Bolsas de regalo")
async function leer(store) {
  const { blobs } = await store.list();
  const movs = (await Promise.all(blobs.filter(b => b.key.indexOf('mov-') === 0).map(b => store.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const extras = (await store.get('extras', { type: 'json' }).catch(() => null)) || [];
  return { movimientos: movs, extras: Array.isArray(extras) ? extras : [] };
}

module.exports = { STORE, ITEMS, TIPOS_MOV, TIPOS_PEDIDO, piezasDeTexto, movimiento, idExtra, calcular, leer, limpio };
