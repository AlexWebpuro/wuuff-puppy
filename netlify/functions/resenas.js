// Reseñas de un producto.
// GET  ?producto=arnes                 → { total, promedio, distribucion, resenas } (solo las aprobadas)
// GET  ?producto=arnes&invitacion=TOK  → { valida, nombre, mascota } para llenar el formulario desde el correo
// POST { producto, estrellas, titulo, texto, nombre, mascota, correo, foto, invitacion } → queda pendiente hasta que Angie la apruebe
const { getStore, connectLambda } = require('@netlify/blobs');
const R = require('../lib/resenas');

function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  try { connectLambda(event); } catch (err) { return json(500, { error: 'No se pudo conectar el almacenamiento' }); }
  const resenas = getStore('resenas');
  const invitaciones = getStore('resenas-invitaciones');
  const q = event.queryStringParameters || {};

  if (event.httpMethod === 'GET') {
    const producto = String(q.producto || '');
    if (!R.PRODUCTOS[producto]) return json(400, { error: 'Producto no válido' });
    if (q.invitacion) {
      const inv = /^[a-f0-9]{32}$/.test(q.invitacion) ? await invitaciones.get('inv-' + q.invitacion, { type: 'json' }) : null;
      const valida = !!(inv && inv.productos.indexOf(producto) > -1 && inv.hechas.indexOf(producto) < 0);
      return json(200, valida ? { valida, nombre: inv.nombre, mascota: inv.mascota } : { valida: false });
    }
    const lista = (await resenas.get('indice-' + producto, { type: 'json' })) || [];
    // Sin caché: una reseña recién aprobada debe verse al recargar la página
    return json(200, Object.assign(R.resumen(lista), { resenas: lista }));
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (err) { return json(400, { error: 'JSON inválido' }); }
  if (b.sitio) return json(200, { ok: true });  // campo trampa para robots
  const v = R.validar(b);
  if (v.error) return json(400, { error: v.error });
  const fotos = R.fotosValidas(b);
  if (!fotos) return json(400, { error: 'Alguna foto no es válida o es muy pesada (máximo ' + R.MAX_FOTOS + ' fotos)' });

  // Compra verificada: el enlace del correo de invitación, una vez por producto
  let inv = null;
  if (/^[a-f0-9]{32}$/.test(String(b.invitacion || ''))) {
    inv = await invitaciones.get('inv-' + b.invitacion, { type: 'json' });
    if (!inv || inv.productos.indexOf(v.datos.producto) < 0 || inv.hechas.indexOf(v.datos.producto) > -1) inv = null;
  }

  const id = Date.now().toString(36) + R.token(4);
  const r = Object.assign({}, v.datos, { id, estado: 'pendiente', clave: R.token(16), creado: new Date().toISOString(),
    verificada: !!inv, pedido: inv ? inv.ref : '', foto: fotos.length > 0, fotos: fotos.length });
  if (inv && !r.correo) r.correo = inv.correo;
  for (let n = 0; n < fotos.length; n++) {
    const by = fotos[n];
    await resenas.set(R.claveFoto(id, n), by.buffer.slice(by.byteOffset, by.byteOffset + by.byteLength), { metadata: { tipo: 'image/jpeg' } });
  }
  await resenas.setJSON('r-' + id, r);
  if (inv) { inv.hechas.push(r.producto); await invitaciones.setJSON('inv-' + b.invitacion, inv); }

  // Aviso a la tienda para aprobarla
  // En la vista previa de Netlify los enlaces apuntan a la misma vista previa
  const host = String((event.headers || {}).host || '');
  const base = /^[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(host) ? 'https://' + host : R.SITIO;
  const urlModerar = `${base}/.netlify/functions/resena-moderar?id=${id}&clave=${r.clave}`;
  await R.enviarCorreo(R.TIENDA_CORREO(), `⭐ Reseña nueva (${r.estrellas}/5) – ${R.PRODUCTOS[r.producto].nombre}`,
    `<div style="font-family:Arial,sans-serif;color:#2d4375;max-width:560px;">
      <h2 style="margin:0 0 6px;">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)} ${R.esc(R.PRODUCTOS[r.producto].nombre)}</h2>
      <p><strong>${R.esc(r.nombre)}</strong>${r.mascota ? ' (de ' + R.esc(r.mascota) + ')' : ''} · ${r.verificada ? '✅ Compra verificada, pedido ' + R.esc(r.pedido) : 'Sin compra verificada'}${r.correo ? ' · ' + R.esc(r.correo) : ''}</p>
      ${r.titulo ? `<p><strong>${R.esc(r.titulo)}</strong></p>` : ''}<p style="white-space:pre-line;">${R.esc(r.texto)}</p>
      ${r.fotos ? '<p>' + Array.from({ length: r.fotos }, (_, n) => `<a href="${base}/.netlify/functions/resena-foto?id=${id}&n=${n}&clave=${r.clave}"><img src="${base}/.netlify/functions/resena-foto?id=${id}&n=${n}&clave=${r.clave}" alt="Foto ${n + 1} de la reseña" style="width:160px;height:160px;object-fit:cover;border-radius:12px;margin:0 6px 6px 0;"></a>`).join('') + '</p>' : ''}
      <p><a href="${urlModerar}" style="display:inline-block;background:#4964af;color:#fff;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:12px;">Revisar y publicar</a></p>
      <p style="font-size:13px;color:#6b7a99;">No aparece en la web hasta que la apruebes.</p>
    </div>`);
  return json(200, { ok: true, verificada: r.verificada });
};
