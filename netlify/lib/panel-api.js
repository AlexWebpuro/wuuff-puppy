// API del panel de pedidos (la pantalla está en /panel/). Todo pasa por aquí y pide la clave.
// La publica netlify/functions/panel-pedidos.js.
//
// Variable de entorno en Netlify (obligatoria):
//   PANEL_CLAVE   la clave para entrar al panel (mínimo 8 caracteres). Si la cambias, se cierran todas las sesiones.
//
//   POST { accion: 'entrar', clave }                → { token }  (la sesión se cierra a los 30 minutos sin usar el panel;
//                                                     cada respuesta trae un token renovado en la cabecera X-Panel-Token)
//   GET  (Authorization: Bearer token)              → { pedidos: [...] }  (importa los contraentrega nuevos de la web)
//   POST { accion: 'crear', pedido }                → { pedido }
//   POST { accion: 'actualizar', id, cambios }      → { pedido }
//   POST { accion: 'borrar', id }                   → { ok }
//   POST { accion: 'cotizar-guia', id, destino }    → { opciones, cobrarCents }   (Envia, solo Bogotá)
//   POST { accion: 'crear-guia', id, opcion, destino } → { pedido }               (crea la guía y lo marca Enviado)
//   POST { accion: 'inventario' }                   → { items, salidas, sinLeer, movimientos, extras }
//   POST { accion: 'inv-guardar', movs: [{ tipo, item, cantidad, fecha, nota }] } → inventario
//   POST { accion: 'inv-borrar', id | ids: [...] } → inventario   (borra uno o varios)
//   POST { accion: 'inv-producto', nombre }         → inventario  (agrega un producto propio, ej. "Bolsas de regalo")
//   POST { accion: 'inv-quitar-producto', id }      → inventario
const crypto = require('crypto');
const { connectLambda } = require('@netlify/blobs');
const { almacen: getStore } = require('./blobs');
const P = require('./panel');
const E = require('./envia');
const I = require('./inventario');

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
  let r;
  try { r = await atender(event); }
  catch (err) {
    // Si algo falla, el panel muestra el motivo (en vez de un 502 sin explicación)
    console.error('Panel de pedidos', err);
    return json(500, { error: 'Error en el servidor: ' + String(err && err.message || err).slice(0, 200) });
  }
  // Sesión activa: cada respuesta trae un token nuevo, así los 30 minutos cuentan desde el último uso
  if (event._sesionOk && r.statusCode < 500) r.headers = Object.assign({}, r.headers, { 'X-Panel-Token': P.crearToken(process.env.PANEL_CLAVE || '') });
  return r;
};

async function atender(event) {
  const clave = process.env.PANEL_CLAVE || '';
  if (clave.length < 8) return json(500, { error: 'Falta configurar PANEL_CLAVE en Netlify (mínimo 8 caracteres).' });

  if (event.blobs) connectLambda(event);
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
  event._sesionOk = true;

  // ── Lista (y trae los pedidos contraentrega nuevos de la web) ──
  if (event.httpMethod === 'GET') {
    const porId = await P.listaConContraentrega(store, getStore('pedidos-contraentrega'));
    // Número de pedido a los que aún no lo tienen (pedidos viejos y los que llegan de la web)
    const nuevos = P.asignarNumeros(Array.from(porId.values()));
    await Promise.all(nuevos.map(p => store.setJSON(p.id, p)));
    const lista = Array.from(porId.values()).filter(p => !p.borrado).sort((a, b) => (a.creado < b.creado ? 1 : -1));
    return json(200, { pedidos: lista });
  }

  // ── Crear ──
  if (b.accion === 'crear') {
    const d = b.pedido || {};
    if (!P.limpio(d.cliente && d.cliente.nombre) && !P.limpio(d.productos)) return json(400, { error: 'Escribe al menos el cliente o el producto' });
    const p = P.nuevoPedido(d);
    // Número de pedido: el siguiente al mayor que ya existe
    const { blobs } = await store.list();
    const todos = (await Promise.all(blobs.map(x => store.get(x.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
    P.asignarNumeros(todos.concat([p]));
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
      // (conserva su número para que no se vuelva a usar)
      await store.setJSON(p.id, Object.assign({ id: p.id, borrado: true, borradoEl: new Date().toISOString() }, Number.isInteger(p.numero) ? { numero: p.numero } : {}));
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
    // Los pedidos se van leyendo mientras tanto (en paralelo)
    const pedidosPanel = store.list().then(({ blobs }) => Promise.all(blobs.map(x => store.get(x.key, { type: 'json' }).catch(() => null)))).then(l => l.filter(Boolean)).catch(err => { console.error('No se pudieron leer los pedidos', err.message); return []; });
    let guardados = [];
    let { movimientos, extras } = await I.leer(inv);
    // Lo que el panel guardó o borró hace un momento (por si la lista del almacén aún no lo muestra)
    movimientos = I.fusionar(movimientos, b.recientes, b.borrados);
    if (b.accion === 'inv-guardar') {
      const validos = I.ITEMS.concat(extras).map(x => x.id);
      const nuevos = (Array.isArray(b.movs) ? b.movs.slice(0, 60) : []).map(m => I.movimiento(m, validos)).filter(Boolean);
      if (!nuevos.length) return json(400, { error: 'Escribe al menos una cantidad' });
      // Si el mismo lote ya estaba (se envió dos veces), reemplaza al anterior en vez de sumarse
      const ids = new Set(nuevos.map(m => m.id));
      movimientos = movimientos.filter(m => !ids.has(m.id)).concat(nuevos);
      await I.guardarMovimientos(inv, movimientos);
      guardados = nuevos;
    }
    if (b.accion === 'inv-borrar') {
      const ids = (Array.isArray(b.ids) ? b.ids.slice(0, 300) : [b.id]).map(String).filter(id => /^mov-[a-z0-9-]{4,60}$/.test(id));
      if (!ids.length) return json(400, { error: 'Movimiento no válido' });
      movimientos = movimientos.filter(m => !ids.includes(m.id));
      await I.guardarMovimientos(inv, movimientos);
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
    const pedidos = await pedidosPanel;
    const r = I.calcular(pedidos, movimientos, extras);
    return json(200, Object.assign(r, { extras, guardados, movimientos: movimientos.sort((a, b2) => (a.fecha < b2.fecha ? 1 : a.fecha > b2.fecha ? -1 : (a.creado < b2.creado ? 1 : -1))).slice(0, 300) }));
  }

  return json(400, { error: 'Acción no válida' });
}
