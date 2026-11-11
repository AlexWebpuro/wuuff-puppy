// API del panel de pedidos (la pantalla está en /panel/). Todo pasa por aquí y pide la clave.
//
// Variable de entorno en Netlify (obligatoria):
//   PANEL_CLAVE   la clave para entrar al panel (mínimo 8 caracteres). Si la cambias, se cierran todas las sesiones.
//
//   POST { accion: 'entrar', clave }                → { token }  (sesión de 30 días)
//   GET  (Authorization: Bearer token)              → { pedidos: [...] }  (importa los contraentrega nuevos de la web)
//   POST { accion: 'crear', pedido }                → { pedido }
//   POST { accion: 'actualizar', id, cambios }      → { pedido }
//   POST { accion: 'borrar', id }                   → { ok }
//   POST { accion: 'cotizar-guia', id, destino }    → { opciones, cobrarCents }   (Envia, solo Bogotá)
//   POST { accion: 'crear-guia', id, opcion, destino } → { pedido }               (crea la guía y lo marca Enviado)
//   POST { accion: 'inventario' }                   → { items, salidas, sinLeer, movimientos, extras }
//   POST { accion: 'inv-guardar', movs: [{ tipo, item, cantidad, fecha, nota }] } → inventario
//   POST { accion: 'inv-borrar', id }               → inventario
//   POST { accion: 'inv-producto', nombre }         → inventario  (agrega un producto propio, ej. "Bolsas de regalo")
//   POST { accion: 'inv-quitar-producto', id }      → inventario
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const P = require('../lib/panel');
const E = require('../lib/envia');
const I = require('../lib/inventario');

const MAX_INTENTOS = 8;                 // intentos de clave fallidos…
const VENTANA_MS = 15 * 60 * 1000;      // …cada 15 minutos por conexión

function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    body: JSON.stringify(data)
  };
}

exports.handler = async function (event) {
  const clave = process.env.PANEL_CLAVE || '';
  if (clave.length < 8) return json(500, { error: 'Falta configurar PANEL_CLAVE en Netlify (mínimo 8 caracteres).' });

  connectLambda(event);
  const store = getStore(P.STORE);

  let b = {};
  if (event.httpMethod === 'POST') {
    try { b = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '{}')); }
    catch (err) { return json(400, { error: 'JSON inválido' }); }
  } else if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Método no permitido' });
  }

  // ── Entrar con la clave ──
  if (b.accion === 'entrar') {
    const ip = (event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'])) || 'sin-ip';
    const llave = 'intentos-' + crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 24);
    const intentos = getStore('panel-intentos');
    const ahora = Date.now();
    let reg = (await intentos.get(llave, { type: 'json' })) || { n: 0, desde: ahora };
    if (ahora - reg.desde > VENTANA_MS) reg = { n: 0, desde: ahora };
    if (reg.n >= MAX_INTENTOS) return json(429, { error: 'Demasiados intentos. Espera 15 minutos.' });
    if (!P.claveCorrecta(b.clave, clave)) {
      reg.n += 1;
      await intentos.setJSON(llave, reg);
      return json(401, { error: 'Clave incorrecta' });
    }
    if (reg.n) await intentos.delete(llave);
    return json(200, { token: P.crearToken(clave) });
  }

  // ── Todo lo demás pide sesión ──
  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  if (!P.tokenValido(auth.replace(/^Bearer\s+/i, ''), clave)) return json(401, { error: 'Sesión vencida', sesion: false });

  // ── Lista (y trae los pedidos contraentrega nuevos de la web) ──
  if (event.httpMethod === 'GET') {
    const porId = await P.listaConContraentrega(store, getStore('pedidos-contraentrega'));
    const lista = Array.from(porId.values()).filter(p => !p.borrado).sort((a, b) => (a.creado < b.creado ? 1 : -1));
    return json(200, { pedidos: lista });
  }

  // ── Crear ──
  if (b.accion === 'crear') {
    const d = b.pedido || {};
    if (!P.limpio(d.cliente && d.cliente.nombre) && !P.limpio(d.productos)) return json(400, { error: 'Escribe al menos el cliente o el producto' });
    const p = P.nuevoPedido(d);
    await store.setJSON(p.id, p);
    return json(200, { pedido: p });
  }

  // ── Actualizar / borrar ──
  if (b.accion === 'actualizar' || b.accion === 'borrar') {
    if (!P.idValido(b.id)) return json(400, { error: 'Pedido no válido' });
    const p = await store.get(b.id, { type: 'json' });
    if (!p || p.borrado) return json(404, { error: 'El pedido no existe' });
    if (b.accion === 'borrar') {
      // Se deja una marca para que un contraentrega de la web no se vuelva a importar
      await store.setJSON(p.id, { id: p.id, borrado: true, borradoEl: new Date().toISOString() });
      return json(200, { ok: true });
    }
    P.aplicarCambios(p, b.cambios || {});
    await store.setJSON(p.id, p);
    return json(200, { pedido: p });
  }

  // ── Guía de Envia desde el panel (Bogotá; con recaudo si el pedido no está pagado) ──
  if (b.accion === 'cotizar-guia' || b.accion === 'crear-guia') {
    if (!E.configurado()) return json(500, { error: 'Falta configurar Envia en Netlify (ENVIA_API_KEY, ENVIA_ORIGEN_TELEFONO, ENVIA_ORIGEN_DIRECCION).' });
    if (!P.idValido(b.id)) return json(400, { error: 'Pedido no válido' });
    const p = await store.get(b.id, { type: 'json' });
    if (!p || p.borrado) return json(404, { error: 'El pedido no existe' });
    if (p.guia && p.guia.numero) return json(200, { pedido: p });
    const c = p.cliente || {}, d = b.destino && typeof b.destino === 'object' ? b.destino : {};
    const destino = {
      nombre: P.limpio(d.nombre || c.nombre, 120), telefono: P.limpio(d.telefono || c.telefono, 30), correo: P.limpio(c.correo, 160),
      direccion: P.limpio(d.direccion || c.direccion, 250), barrio: P.limpio(d.barrio, 80), referencia: P.limpio(d.referencia, 120),
      cp: /^\d{6}$/.test(String(d.cp || '')) ? String(d.cp) : '110111'
    };
    if (!E.esBogota(d.ciudad || c.ciudad)) return json(400, { error: 'Por ahora la guía desde el panel es solo para Bogotá y Soacha. Para otra ciudad, créala en Envia.com.' });
    if (destino.nombre.length < 2 || E.soloDigitos(destino.telefono).length !== 10 || destino.direccion.length < 5) return json(400, { error: 'Revisa el nombre, el celular (10 números) y la dirección.' });
    const cobrarCents = p.pagado ? 0 : Math.round(p.totalCents || 0);
    try {
      if (b.accion === 'cotizar-guia') return json(200, { opciones: await E.cotizar(destino, p.totalCents, cobrarCents), cobrarCents });
      const g = await E.generar(destino, p.totalCents, cobrarCents, b.opcion, p.id);
      p.guia = { transportadora: g.carrier === 'coordinadora' ? 'Coordinadora' : g.carrier, numero: g.trackingNumber, url: g.trackUrl, pdf: g.label, costoCents: Math.round((g.totalPrice || 0) * 100) };
      P.historial(p, '📦 Guía de Envia ' + g.trackingNumber + (cobrarCents ? ' · cobra ' + P.pesos(cobrarCents) + ' al entregar' : ' · sin recaudo'));
      if (['por-confirmar', 'confirmado', 'preparando'].includes(p.estado)) {
        P.historial(p, 'Estado: ' + P.ETIQUETAS[p.estado] + ' → Enviado');
        p.estado = 'enviado'; p.enviado = g.creada;
      }
      p.actualizado = new Date().toISOString();
      await store.setJSON(p.id, p);
      // Si es un contraentrega de la web, la guía también queda en su registro (así el enlace del correo la muestra)
      try {
        const ce = getStore('pedidos-contraentrega'), reg = await ce.get(p.id, { type: 'json' });
        if (reg && !reg.guia) { reg.guia = g; reg.estado = 'guia-creada'; await ce.setJSON(p.id, reg); }
      } catch (err) { console.error('No se pudo copiar la guía al pedido contraentrega', err.message); }
      return json(200, { pedido: p });
    } catch (err) {
      console.error('Envia desde el panel', err.message);
      return json(502, { error: 'Envia: ' + err.message });
    }
  }

  // ── Inventario ──
  if (['inventario', 'inv-guardar', 'inv-borrar', 'inv-producto', 'inv-quitar-producto'].includes(b.accion)) {
    const inv = getStore(I.STORE);
    let { movimientos, extras } = await I.leer(inv);
    if (b.accion === 'inv-guardar') {
      const validos = I.ITEMS.concat(extras).map(x => x.id);
      const nuevos = (Array.isArray(b.movs) ? b.movs.slice(0, 40) : []).map(m => I.movimiento(m, validos)).filter(Boolean);
      if (!nuevos.length) return json(400, { error: 'Escribe al menos una cantidad' });
      for (const m of nuevos) await inv.setJSON(m.id, m);
      movimientos = movimientos.concat(nuevos);
    }
    if (b.accion === 'inv-borrar') {
      if (!/^mov-[a-z0-9-]{4,40}$/.test(String(b.id || ''))) return json(400, { error: 'Movimiento no válido' });
      await inv.delete(b.id);
      movimientos = movimientos.filter(m => m.id !== b.id);
    }
    if (b.accion === 'inv-producto') {
      const nombre = I.limpio(b.nombre, 60), id = I.idExtra(nombre);
      if (!id) return json(400, { error: 'Escribe el nombre del producto' });
      if (I.ITEMS.concat(extras).some(x => x.id === id)) return json(400, { error: 'Ese producto ya está en el inventario' });
      if (extras.length >= 40) return json(400, { error: 'Ya tienes muchos productos propios' });
      extras = extras.concat([{ id, nombre }]);
      await inv.setJSON('extras', extras);
    }
    if (b.accion === 'inv-quitar-producto') {
      extras = extras.filter(x => x.id !== b.id);
      await inv.setJSON('extras', extras);
    }
    const porId = await P.listaConContraentrega(store, getStore('pedidos-contraentrega'));
    const r = I.calcular(Array.from(porId.values()), movimientos, extras);
    return json(200, Object.assign(r, { extras, movimientos: movimientos.sort((a, b2) => (a.fecha < b2.fecha ? 1 : -1)).slice(0, 80) }));
  }

  return json(400, { error: 'Acción no válida' });
};
