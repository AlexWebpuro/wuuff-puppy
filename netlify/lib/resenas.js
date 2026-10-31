// Reseñas de clientes: reglas compartidas por las funciones resenas, resena-moderar, resena-foto y resenas-invitar.
// Store de Netlify Blobs "resenas":
//   r-<id>             → la reseña (pendiente, aprobada o rechazada) con su clave de moderación
//   foto-<id>          → la foto (JPEG), solo se muestra cuando la reseña está aprobada
//   indice-<producto>  → lista de reseñas aprobadas de ese producto (lo que lee la página)
// Store "resenas-invitaciones":
//   inv-<token>        → invitación de un pedido: quién compró, qué productos y cuáles ya reseñó
//   pedido-<ref>       → pedido por invitar (lo escriben pedido-contraentrega y wompi-webhook)
const crypto = require('crypto');

const SITIO = 'https://wuuffpuppy.co';
const PRODUCTOS = {
  combo: { nombre: 'Combo completo', url: '/combo-collar-arnes-correa/' },
  'arnes-correa': { nombre: 'Arnés + correa', url: '/arnes-y-correa-impermeable-perro/' },
  'collar-correa': { nombre: 'Collar + correa', url: '/collar-y-correa-impermeable-perro/' },
  arnes: { nombre: 'Arnés tipo H', url: '/arnes-tipo-h-impermeable-perro/' },
  collar: { nombre: 'Collar', url: '/collar-impermeable-perro/' },
  correa: { nombre: 'Correa', url: '/correa-impermeable-perro/' },
  placa: { nombre: 'Placa Inteligente Wuuff', url: '/placa-para-perro/' }
};
const DIAS_INVITAR = { bogota: 7, otras: 10 };  // días después del pedido para pedir la reseña
const FOTO_MAX_BYTES = 1500000;
const MAX_FOTOS = 4;
const INDICE_MAX = 300;

function limpio(v, max) { return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function texto(v, max) { return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function token(n) { return crypto.randomBytes(n || 18).toString('hex'); }
// "Ana María Pérez" → "Ana María P." (como en las reseñas de otras tiendas, sin el apellido completo)
function nombrePublico(n) {
  const p = limpio(n, 60).split(' ').filter(Boolean);
  if (!p.length) return 'Cliente Wuuff';
  if (p.length === 1) return p[0];
  const ult = p.pop();
  return p.join(' ') + ' ' + ult.charAt(0).toUpperCase() + '.';
}

// Productos (claves de esta lista) que trae un carrito de la tienda
function productosDeCarrito(carrito, conRegalo) {
  const c = carrito && typeof carrito === 'object' ? carrito : {};
  const out = [];
  (Array.isArray(c.items) ? c.items : []).forEach(it => { if (it && PRODUCTOS[it.p] && out.indexOf(it.p) < 0) out.push(it.p); });
  if ((c.placa || conRegalo) && out.indexOf('placa') < 0) out.push('placa');
  return out;
}

// Foto en data URL (el navegador ya la reduce a JPEG); devuelve los bytes o null
function fotoValida(v) {
  if (!v) return { vacia: true };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(v));
  if (!m) return null;
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length < 200 || bytes.length > FOTO_MAX_BYTES || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  return { bytes };
}

// Hasta MAX_FOTOS fotos (acepta también "foto" sola, del formulario anterior). Devuelve la lista de bytes o null si alguna no sirve
function fotosValidas(b) {
  const lista = (Array.isArray(b.fotos) ? b.fotos : (b.foto ? [b.foto] : [])).filter(Boolean);
  if (lista.length > MAX_FOTOS) return null;
  const out = [];
  for (const f of lista) { const v = fotoValida(f); if (!v || v.vacia) return null; out.push(v.bytes); }
  return out;
}
// Clave de la foto n de una reseña (la primera conserva el nombre de antes)
function claveFoto(id, n) { return n ? 'foto-' + id + '-' + n : 'foto-' + id; }

// Valida lo que manda el formulario. Devuelve { error } o { datos }
function validar(b) {
  const producto = String(b.producto || '');
  if (!PRODUCTOS[producto]) return { error: 'Producto no válido' };
  const estrellas = parseInt(b.estrellas, 10);
  if (!(estrellas >= 1 && estrellas <= 5)) return { error: 'Elige de 1 a 5 estrellas' };
  const nombre = limpio(b.nombre, 60);
  if (nombre.length < 2) return { error: 'Escribe tu nombre' };
  const cuerpo = texto(b.texto, 1500);
  if (cuerpo.length < 10) return { error: 'Cuéntanos un poco más (mínimo 10 letras)' };
  const correo = limpio(b.correo, 160);
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { error: 'Revisa tu correo' };
  return { datos: { producto, estrellas, nombre, correo, titulo: limpio(b.titulo, 90), texto: cuerpo, mascota: limpio(b.mascota, 30) } };
}

// Lo que se muestra en la página (nunca el correo ni la clave de moderación)
function publica(r) {
  return { id: r.id, estrellas: r.estrellas, nombre: nombrePublico(r.nombre), mascota: r.mascota || '', titulo: r.titulo || '', texto: r.texto,
    fecha: r.creado, verificada: !!r.verificada, foto: !!r.foto, fotos: r.fotos || (r.foto ? 1 : 0) };
}
function resumen(lista) {
  const dist = [0, 0, 0, 0, 0];
  lista.forEach(r => { dist[r.estrellas - 1]++; });
  const total = lista.length;
  const promedio = total ? Math.round(lista.reduce((s, r) => s + r.estrellas, 0) / total * 100) / 100 : 0;
  return { total, promedio, distribucion: { 5: dist[4], 4: dist[3], 3: dist[2], 2: dist[1], 1: dist[0] } };
}

// Días desde el pedido para invitar (Bogotá llega antes que el resto del país)
function listoParaInvitar(p, ahora) {
  const dias = /bogot|soacha/i.test(p.ciudad || '') ? DIAS_INVITAR.bogota : DIAS_INVITAR.otras;
  return new Date(ahora) - new Date(p.creado) >= dias * 864e5;
}

// Guarda un pedido por invitar (no lo pisa si ya existe: el webhook de Wompi puede llegar dos veces)
async function guardarPorInvitar(store, ref, p) {
  const correo = limpio(p.correo, 160);
  const productos = (p.productos || []).filter(k => PRODUCTOS[k]);
  if (!ref || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || !productos.length) return false;
  if (await store.get('pedido-' + ref)) return false;
  await store.setJSON('pedido-' + ref, { ref, correo, nombre: limpio(p.nombre, 120), mascota: limpio(p.mascota, 30),
    ciudad: limpio(p.ciudad, 80), productos, creado: p.creado || new Date().toISOString() });
  return true;
}

function correoInvitacion(inv, tok) {
  const hola = inv.nombre ? esc(inv.nombre.split(' ')[0]) : '';
  const perro = inv.mascota ? esc(inv.mascota) : 'tu perrihijo';
  const botones = inv.productos.map(k => `<p style="margin:10px 0;"><a href="${SITIO}${PRODUCTOS[k].url}?resena=${tok}#resenas" style="display:inline-block;background:#4964af;color:#fff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px;">⭐ Opinar sobre: ${esc(PRODUCTOS[k].nombre)}</a></p>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#2d4375;max-width:520px;">
    <h2 style="margin:0 0 8px;">¿Cómo le quedó a ${perro}? 🐾</h2>
    <p>${hola ? 'Hola ' + hola + ', ' : ''}gracias por comprar en Wuuff Puppy. Nos ayudaría mucho que nos cuentes cómo les ha ido: tu opinión ayuda a otras familias a elegir la talla y el producto.</p>
    ${botones}
    <p style="font-size:13px;color:#6b7a99;">Toma un minuto. Si quieres, sube una foto de ${perro} usándolo 📸. Tu reseña aparece en la web marcada como <strong>compra verificada</strong>, con tu nombre y la inicial del apellido.</p>
  </div>`;
}

const TIENDA_CORREO = () => process.env.RESEND_REPLY_TO || 'wuuffpuppy@gmail.com';
async function enviarCorreo(para, asunto, html) {
  if (!process.env.RESEND_API_KEY) { console.error('Falta RESEND_API_KEY'); return false; }
  const from = process.env.RESEND_FROM ? `Wuuff Puppy <${process.env.RESEND_FROM}>` : 'Wuuff Puppy <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [para], reply_to: TIENDA_CORREO(), subject: asunto, html })
    });
    if (!r.ok) console.error('Resend respondió', r.status);
    return r.ok;
  } catch (err) { console.error('No se pudo enviar el correo', err.message); return false; }
}

// Invita los pedidos que ya cumplieron los días: crea su enlace y le escribe al cliente
async function invitarPendientes(store, ahora) {
  const { blobs } = await store.list({ prefix: 'pedido-' });
  let enviadas = 0;
  for (const b of blobs) {
    const p = await store.get(b.key, { type: 'json' });
    if (!p || !listoParaInvitar(p, ahora || Date.now())) continue;
    const tok = token(16);
    await store.setJSON('inv-' + tok, { ref: p.ref, correo: p.correo, nombre: p.nombre, mascota: p.mascota, productos: p.productos, hechas: [], creado: new Date(ahora || Date.now()).toISOString() });
    const ok = await enviarCorreo(p.correo, '¿Cómo le quedó a ' + (p.mascota || 'tu perrihijo') + '? Cuéntanos 🐾', correoInvitacion(p, tok));
    if (ok) { await store.delete(b.key); enviadas++; } else await store.delete('inv-' + tok);
  }
  return enviadas;
}

module.exports = { MAX_FOTOS, fotosValidas, claveFoto, TIENDA_CORREO, enviarCorreo, invitarPendientes, SITIO, PRODUCTOS, INDICE_MAX, limpio, esc, token, nombrePublico, productosDeCarrito, fotoValida, validar, publica, resumen,
  listoParaInvitar, guardarPorInvitar, correoInvitacion };
