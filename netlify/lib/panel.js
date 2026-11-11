// Panel de pedidos de Wuuff Puppy (wuuffpuppy.co/panel/): reglas compartidas.
// Los pedidos se guardan en Netlify Blobs, en el almacén "panel-pedidos" (un registro por pedido).
//   - Pedidos de la web pagados con Wompi: los agrega wompi-webhook cuando el pago queda APROBADO.
//   - Pedidos contraentrega de la web: se importan solos desde "pedidos-contraentrega" al abrir el panel
//     (y si ya se creó la guía de Envia, el pedido pasa a "Enviado" con su número de guía).
//   - Pedidos de WhatsApp, Instagram, stand, consignación, etc.: los crea Angie a mano en el panel.
const crypto = require('crypto');

const STORE = 'panel-pedidos';

const ESTADOS = ['por-confirmar', 'confirmado', 'preparando', 'enviado', 'entregado', 'cancelado', 'devuelto'];
const ORIGENES = ['web', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'marketplace', 'stand', 'consignacion', 'otro'];
const PAGOS = ['contraentrega', 'wompi', 'nequi', 'transferencia', 'efectivo', 'otro'];

function limpio(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max || 200);
}
function centavos(v) {
  // Acepta "59.900", "$59900", 59900 → centavos
  const n = parseInt(String(v == null ? '' : v).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : Math.min(n, 100000000) * 100;
}
function nuevoId() {
  return 'P-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}
function idValido(id) {
  return /^[A-Za-z0-9_-]{3,60}$/.test(String(id || ''));
}

// ── Acceso con clave (variable PANEL_CLAVE en Netlify) ─────────────────────────
// La sesión es un token firmado que dura 30 días; si cambias PANEL_CLAVE, se cierran todas las sesiones.
const DURACION_MS = 30 * 24 * 60 * 60 * 1000;
function firmar(texto, clave) {
  return crypto.createHmac('sha256', 'wuuff-panel:' + clave).update(texto).digest('base64url');
}
function crearToken(clave, ahora) {
  const vence = String((ahora || Date.now()) + DURACION_MS);
  return vence + '.' + firmar(vence, clave);
}
function tokenValido(token, clave, ahora) {
  if (!token || !clave) return false;
  const [vence, firma] = String(token).split('.');
  if (!vence || !firma || !/^\d+$/.test(vence) || Number(vence) < (ahora || Date.now())) return false;
  const esperada = firmar(vence, clave);
  return firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}
function claveCorrecta(intento, clave) {
  if (!intento || !clave) return false;
  const a = crypto.createHash('sha256').update(String(intento)).digest();
  const b = crypto.createHash('sha256').update(String(clave)).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Pedido ───────────────────────────────────────────────────────────────────
function historial(p, texto, ahora) {
  p.historial = Array.isArray(p.historial) ? p.historial : [];
  p.historial.push({ fecha: new Date(ahora || Date.now()).toISOString(), texto: limpio(texto, 300) });
  if (p.historial.length > 60) p.historial = p.historial.slice(-60);
}

// Arma/actualiza un pedido con lo que llega del formulario del panel (solo campos permitidos)
function aplicarCambios(p, d, ahora) {
  const cambios = [];
  const c = d.cliente && typeof d.cliente === 'object' ? d.cliente : {};
  p.cliente = p.cliente || {};
  ['nombre', 'telefono', 'correo', 'direccion', 'ciudad'].forEach(k => {
    if (c[k] !== undefined) p.cliente[k] = limpio(c[k], k === 'direccion' ? 250 : 160);
  });
  if (d.mascota !== undefined) p.mascota = limpio(d.mascota, 80);
  if (d.productos !== undefined) p.productos = limpio(d.productos, 1500);
  if (d.notas !== undefined) p.notas = limpio(d.notas, 2000);
  if (d.origen !== undefined && ORIGENES.includes(d.origen)) p.origen = d.origen;
  if (d.pago !== undefined && PAGOS.includes(d.pago)) p.pago = d.pago;
  if (d.total !== undefined) p.totalCents = centavos(d.total);
  if (d.costoEnvio !== undefined) p.costoEnvioCents = centavos(d.costoEnvio);
  if (d.guia && typeof d.guia === 'object') {
    p.guia = Object.assign({}, p.guia, {
      transportadora: limpio(d.guia.transportadora, 60),
      numero: limpio(d.guia.numero, 60),
      url: /^https?:\/\//.test(d.guia.url || '') ? limpio(d.guia.url, 400) : ''
    });
  }
  if (d.pagado !== undefined && !!d.pagado !== !!p.pagado) {
    p.pagado = !!d.pagado;
    cambios.push(p.pagado ? '💰 Marcado como pagado' : 'Marcado como NO pagado');
  }
  if (d.estado !== undefined && ESTADOS.includes(d.estado) && d.estado !== p.estado) {
    cambios.push('Estado: ' + (ETIQUETAS[p.estado] || p.estado || '—') + ' → ' + ETIQUETAS[d.estado]);
    p.estado = d.estado;
    // Contraentrega entregada = el dinero se recaudó (se puede desmarcar si la transportadora aún no lo consigna)
    if (d.estado === 'entregado' && p.pago === 'contraentrega' && d.pagado === undefined && !p.pagado) {
      p.pagado = true; cambios.push('💰 Contraentrega entregada: marcado como pagado');
    }
    if (d.estado === 'enviado' && !p.enviado) p.enviado = new Date(ahora || Date.now()).toISOString();
    if (d.estado === 'entregado') p.entregado = new Date(ahora || Date.now()).toISOString();
    // Si se devuelve a un estado anterior (por ejemplo, se marcó Entregado sin querer), se quitan las fechas que ya no aplican
    if (['por-confirmar', 'confirmado', 'preparando', 'enviado'].includes(d.estado)) delete p.entregado;
    if (['por-confirmar', 'confirmado', 'preparando'].includes(d.estado)) delete p.enviado;
  }
  if (d.nota) cambios.push('📝 ' + limpio(d.nota, 280));
  cambios.forEach(t => historial(p, t, ahora));
  p.actualizado = new Date(ahora || Date.now()).toISOString();
  return p;
}

function nuevoPedido(d, ahora) {
  const p = {
    id: nuevoId(), origen: 'whatsapp', pago: 'nequi', pagado: false, estado: 'confirmado',
    cliente: {}, mascota: '', productos: '', notas: '', totalCents: 0, costoEnvioCents: 0,
    creado: new Date(ahora || Date.now()).toISOString(), historial: []
  };
  if (d && d.fecha && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) p.creado = new Date(d.fecha + 'T12:00:00-05:00').toISOString();
  historial(p, 'Pedido creado en el panel', ahora);
  aplicarCambios(p, Object.assign({}, d, { nota: undefined }), ahora);
  if (d && ESTADOS.includes(d.estado)) p.estado = d.estado;
  if (d && d.pagado !== undefined) p.pagado = !!d.pagado;
  return p;
}

const ETIQUETAS = {
  'por-confirmar': 'Por confirmar', confirmado: 'Confirmado', preparando: 'Preparando', enviado: 'Enviado',
  entregado: 'Entregado', cancelado: 'Cancelado', devuelto: 'Devuelto'
};

// Pedido contraentrega de la web (almacén "pedidos-contraentrega") → pedido del panel
function desdeContraentrega(ce, sitio) {
  const p = {
    id: ce.referencia, origen: 'web', pago: 'contraentrega', pagado: false,
    estado: ce.guia ? 'enviado' : 'por-confirmar',
    cliente: { nombre: ce.nombre || '', telefono: ce.telefono || '', correo: ce.correo || '', direccion: ce.direccion || '', ciudad: ce.ciudad || '' },
    mascota: ce.mascota || '', productos: ce.producto || '', notas: '',
    totalCents: Math.round(ce.totalCents || 0), costoEnvioCents: 0,
    codigo: ce.codigo ? { codigo: ce.codigo.codigo, tipo: ce.codigo.tipo, participante: ce.codigo.participante || '' } : null,
    descuentoCents: ce.descuentoCents || 0,
    enviaUrl: ce.token ? (sitio || 'https://wuuffpuppy.co/') + '.netlify/functions/envia-guia?ref=' + encodeURIComponent(ce.referencia) + '&t=' + ce.token : '',
    creado: ce.creado || new Date().toISOString(), historial: []
  };
  if (p.codigo && p.codigo.tipo === 'colaboracion') {
    p.comisionCents = Math.round(p.totalCents * 0.10 / 100) * 100; // 10 % del pedido (contraentrega no cobra envío)
  }
  historial(p, 'Pedido contraentrega de la web', Date.parse(p.creado));
  if (ce.guia) sincronizarGuia(p, ce);
  return p;
}
// Si se creó la guía con el botón de Envia, el pedido del panel la toma
function sincronizarGuia(p, ce) {
  if (!ce || !ce.guia || (p.guia && p.guia.numero)) return false;
  p.guia = { transportadora: ce.guia.carrier || 'Coordinadora', numero: ce.guia.trackingNumber || '', url: ce.guia.trackUrl || '', pdf: ce.guia.label || '' };
  if (['por-confirmar', 'confirmado', 'preparando'].includes(p.estado)) {
    historial(p, 'Estado: ' + ETIQUETAS[p.estado] + ' → Enviado (guía de Envia ' + p.guia.numero + ')');
    p.estado = 'enviado';
    p.enviado = ce.guia.creada || new Date().toISOString();
  }
  p.actualizado = new Date().toISOString();
  return true;
}

// Pedido pagado con Wompi (lo llama wompi-webhook). No duplica si Wompi avisa dos veces.
async function registrarWompi(store, d) {
  if (!d || !idValido(d.referencia)) return null;
  const ya = await store.get(d.referencia, { type: 'json' });
  if (ya) return ya;
  const p = {
    id: d.referencia, origen: 'web', pago: 'wompi', pagado: true, estado: 'confirmado',
    cliente: { nombre: limpio(d.nombre, 120), telefono: limpio(d.telefono, 30), correo: limpio(d.correo, 160), direccion: limpio(d.direccion, 250), ciudad: limpio(d.ciudad, 80) },
    mascota: limpio(d.mascota, 80), productos: limpio(d.producto, 1500),
    notas: Array.isArray(d.avisos) ? d.avisos.map(a => limpio(a, 300)).join('\n') : '',
    totalCents: Math.round(d.totalCents || 0), costoEnvioCents: 0,
    codigo: d.codigo ? { codigo: d.codigo.codigo, tipo: d.codigo.tipo, participante: d.codigo.participante || '' } : null,
    descuentoCents: d.descuentoCents || 0,
    creado: new Date().toISOString(), historial: []
  };
  historial(p, '💳 Pagado con Wompi en la web');
  await store.setJSON(p.id, p);
  return p;
}


// Todos los pedidos del panel + los contraentrega nuevos de la web (que se guardan en el panel) → Map por id.
// Lo usan la API del panel y el recordatorio diario por correo.
async function listaConContraentrega(store, ce) {
  const { blobs } = await store.list();
  const pedidos = (await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const porId = new Map(pedidos.map(p => [p.id, p]));
  try {
    const lista = await ce.list();
    for (const { key } of lista.blobs) {
      const actual = porId.get(key);
      if (actual && actual.borrado) continue;
      // Solo se vuelve a leer el de Envia si es nuevo o si aún puede tener guía nueva
      if (actual && (actual.guia && actual.guia.numero || !['por-confirmar', 'confirmado', 'preparando'].includes(actual.estado))) continue;
      const reg = await ce.get(key, { type: 'json' });
      if (!reg || !reg.referencia) continue;
      if (!actual) {
        const p = desdeContraentrega(reg);
        await store.setJSON(p.id, p);
        porId.set(p.id, p);
      } else if (sincronizarGuia(actual, reg)) {
        await store.setJSON(actual.id, actual);
      }
    }
  } catch (err) {
    console.error('No se pudieron importar los pedidos contraentrega', err.message);
  }
  return porId;
}

// Días hábiles (lunes a viernes) desde que se creó el pedido
function diasHabiles(desde, ahora) {
  let d = new Date(desde), n = 0; const fin = new Date(ahora || Date.now());
  while (d < fin) { d = new Date(d.getTime() + 864e5); if (d <= fin && d.getUTCDay() % 6 !== 0) n++; }
  return n;
}

// Correo del recordatorio: lo pendiente por confirmar, despachar y cobrar. null si no hay nada pendiente.
function correoRecordatorio(pedidos, sitio, ahora) {
  const vivos = pedidos.filter(p => !p.borrado);
  const grupos = [
    ['🕐 Por confirmar (escríbeles por WhatsApp)', vivos.filter(p => p.estado === 'por-confirmar')],
    ['📦 Por despachar', vivos.filter(p => ['confirmado', 'preparando'].includes(p.estado))],
    ['💵 Entregados sin marcar como pagados', vivos.filter(p => p.estado === 'entregado' && !p.pagado)]
  ].filter(g => g[1].length);
  if (!grupos.length) return null;
  const e = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const total = grupos.reduce((n, g) => n + g[1].length, 0);
  const fila = p => {
    const dias = diasHabiles(p.creado, ahora), c = p.cliente || {};
    return `<li style="margin:0 0 10px"><strong>${e(c.nombre || 'Sin nombre')}</strong> · ${pesos(p.totalCents)}${dias >= 2 ? ` · <span style="color:#b3261e;font-weight:bold">⚠️ ${dias} días hábiles</span>` : ''}<br>
      <span style="color:#5b6b93">${e(String(p.productos || '').slice(0, 140))}${c.ciudad ? ' · ' + e(c.ciudad) : ''}</span></li>`;
  };
  const html = `<div style="font-family:Arial,sans-serif;color:#2d4375;max-width:560px">
    <h2 style="margin:0 0 6px">🐾 Pedidos pendientes de hoy</h2>
    <p style="margin:0 0 14px">Tienes <strong>${total}</strong> pedido${total > 1 ? 's' : ''} por atender.</p>
    ${grupos.map(([t, l]) => `<h3 style="margin:16px 0 8px">${t} · ${l.length}</h3><ul style="padding-left:18px;margin:0">${l.slice(0, 25).map(fila).join('')}</ul>`).join('')}
    <p style="margin-top:18px"><a href="${sitio}panel/" style="display:inline-block;background:#4964af;color:#fff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px">Abrir el panel de pedidos</a></p>
  </div>`;
  return { asunto: `🐾 ${total} pedido${total > 1 ? 's' : ''} pendiente${total > 1 ? 's' : ''} hoy · Wuuff Puppy`, html };
}

function pesos(cents) { return '$' + Math.round((cents || 0) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

module.exports = { pesos, listaConContraentrega, diasHabiles, correoRecordatorio,
  STORE, ESTADOS, ORIGENES, PAGOS, ETIQUETAS, limpio, centavos, idValido,
  crearToken, tokenValido, claveCorrecta, aplicarCambios, nuevoPedido, desdeContraentrega, sincronizarGuia, registrarWompi, historial
};
