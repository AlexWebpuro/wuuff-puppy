// Página para que Angie apruebe, rechace o quite una reseña (enlace del correo "Reseña nueva").
// GET ?id&clave → muestra la reseña con los botones. POST (formulario) id, clave, accion → la publica o la quita.
// La acción va por POST para que un antivirus que abra el enlace del correo no la apruebe solo.
const { getStore, connectLambda } = require('@netlify/blobs');
const R = require('../lib/resenas');

function pagina(cuerpo, status) {
  return { statusCode: status || 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reseña · Wuuff Puppy</title>
<style>body{font-family:Arial,sans-serif;color:#2d4375;max-width:560px;margin:0 auto;padding:24px 16px;background:#f9f0ee}.caja{background:#fff;border-radius:18px;padding:20px}
.est{color:#f5a623;font-size:22px;letter-spacing:2px}button{font:inherit;font-weight:bold;border:0;border-radius:12px;padding:13px 20px;cursor:pointer;margin:6px 6px 0 0}
.si{background:#1fa855;color:#fff}.no{background:#e8f0fb;color:#2d4375}img{max-width:100%;border-radius:12px;margin-top:8px}.etq{display:inline-block;font-size:13px;font-weight:bold;padding:4px 10px;border-radius:8px;background:#e8f0fb}</style></head>
<body><div class="caja">${cuerpo}</div></body></html>` };
}

exports.handler = async function (event) {
  connectLambda(event);
  const store = getStore('resenas');
  let q = event.queryStringParameters || {};
  if (event.httpMethod === 'POST') {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : (event.body || '');
    q = Object.fromEntries(new URLSearchParams(raw));
  }
  const id = String(q.id || '');
  const r = /^[a-z0-9]{8,24}$/.test(id) ? await store.get('r-' + id, { type: 'json' }) : null;
  if (!r || !q.clave || q.clave !== r.clave) return pagina('<h2>Enlace no válido</h2><p>Esta reseña no existe o el enlace está incompleto.</p>', 404);
  const prod = R.PRODUCTOS[r.producto];

  if (event.httpMethod === 'POST' && (q.accion === 'aprobar' || q.accion === 'rechazar')) {
    r.estado = q.accion === 'aprobar' ? 'aprobada' : 'rechazada';
    r.moderada = new Date().toISOString();
    await store.setJSON('r-' + id, r);
    let indice = ((await store.get('indice-' + r.producto, { type: 'json' })) || []).filter(x => x.id !== id);
    if (r.estado === 'aprobada') indice.unshift(R.publica(r));
    indice.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    await store.setJSON('indice-' + r.producto, indice.slice(0, R.INDICE_MAX));
    return pagina(r.estado === 'aprobada'
      ? `<h2>✅ Publicada</h2><p>La reseña ya se ve en <a href="${R.SITIO}${prod.url}#resenas">${R.esc(prod.nombre)}</a> (puede tardar un minuto).</p><p>Si cambias de opinión, vuelve a abrir el enlace del correo y quítala.</p>`
      : `<h2>Listo, no se publica</h2><p>La reseña quedó guardada pero no aparece en la web. Si cambias de opinión, vuelve a abrir el enlace del correo.</p>`);
  }

  const estado = { pendiente: '⏳ Pendiente', aprobada: '✅ Publicada', rechazada: '🚫 No publicada' }[r.estado];
  const foto = r.foto ? `<img src="/.netlify/functions/resena-foto?id=${id}&clave=${r.clave}" alt="Foto de la reseña">` : '';
  const boton = (accion, txt, cls) => `<form method="post" style="display:inline"><input type="hidden" name="id" value="${id}"><input type="hidden" name="clave" value="${r.clave}"><input type="hidden" name="accion" value="${accion}"><button class="${cls}">${txt}</button></form>`;
  return pagina(`<p class="etq">${estado}</p>
    <h2 style="margin:10px 0 4px">${R.esc(prod.nombre)}</h2>
    <div class="est">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)}</div>
    <p><strong>${R.esc(r.nombre)}</strong> → en la web: ${R.esc(R.nombrePublico(r.nombre))}${r.mascota ? ' · de ' + R.esc(r.mascota) : ''}<br>${r.verificada ? '✅ Compra verificada (pedido ' + R.esc(r.pedido) + ')' : 'Sin compra verificada'}${r.correo ? ' · ' + R.esc(r.correo) : ''}</p>
    ${r.titulo ? `<p><strong>${R.esc(r.titulo)}</strong></p>` : ''}<p style="white-space:pre-line">${R.esc(r.texto)}</p>${foto}
    <p style="font-size:14px;color:#6b7a99">Rechaza solo groserías, spam, datos personales o fotos que no tengan que ver. Las opiniones honestas, aunque no sean de 5 estrellas, dan confianza.</p>
    ${r.estado !== 'aprobada' ? boton('aprobar', 'Publicar en la web', 'si') : ''}${r.estado !== 'rechazada' ? boton('rechazar', r.estado === 'aprobada' ? 'Quitar de la web' : 'No publicar', 'no') : ''}`);
};
