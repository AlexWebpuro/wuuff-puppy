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
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');
const P = require('../lib/panel');

const MAX_INTENTOS = 8;                 // intentos de clave fallidos…
const VENTANA_MS = 15 * 60 * 1000;      // …cada 15 minutos por conexión

function json(status, data) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
    body: JSON.stringify(data)
  };
}

async function todos(store) {
  const { blobs } = await store.list();
  const lista = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)));
  return lista.filter(Boolean);
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
    const pedidos = await todos(store);
    const porId = new Map(pedidos.map(p => [p.id, p]));
    try {
      const ce = getStore('pedidos-contraentrega');
      const { blobs } = await ce.list();
      for (const { key } of blobs) {
        const actual = porId.get(key);
        if (actual && actual.borrado) continue;
        // Solo se vuelve a leer el de Envia si es nuevo o si aún puede tener guía nueva
        if (actual && (actual.guia && actual.guia.numero || !['por-confirmar', 'confirmado', 'preparando'].includes(actual.estado))) continue;
        const reg = await ce.get(key, { type: 'json' });
        if (!reg || !reg.referencia) continue;
        if (!actual) {
          const nuevo = P.desdeContraentrega(reg);
          await store.setJSON(nuevo.id, nuevo);
          porId.set(nuevo.id, nuevo);
        } else if (P.sincronizarGuia(actual, reg)) {
          await store.setJSON(actual.id, actual);
        }
      }
    } catch (err) {
      console.error('No se pudieron importar los pedidos contraentrega', err.message);
    }
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

  return json(400, { error: 'Acción no válida' });
};
