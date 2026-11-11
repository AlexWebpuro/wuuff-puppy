// Perfiles de la Placa Inteligente (chip NFC) de un pedido: uno por placa.
// Los usan wompi-webhook y pedido-contraentrega para marcarlos y armar los enlaces del chip y de edición.

// Marca cada perfil con el estado del pedido y devuelve [{ id, mascota, urlChip, urlEditar }]
async function marcarPerfiles(store, ids, estado, referencia, sitio) {
  const out = [];
  for (const id of ids || []) {
    try {
      const perfil = await store.get(id, { type: 'json' });
      if (!perfil) continue;
      perfil.pedido = Object.assign({}, perfil.pedido, { estado, referencia: referencia || '' });
      await store.setJSON(perfil.id, perfil);
      out.push({ id: perfil.id, mascota: (perfil.mascota && perfil.mascota.nombre) || '',
        urlChip: sitio + 'm/' + perfil.id, urlEditar: sitio + 'placa-nfc/perfil/#id=' + perfil.id + '&clave=' + perfil.clave });
    } catch (err) {
      console.error('No se pudo actualizar el perfil NFC', id, err.message);
    }
  }
  return out;
}

// Bloque del correo a la tienda: qué dirección grabar en cada chip
function htmlChips(perfiles) {
  if (!perfiles.length) return '';
  const e = v => String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  return '<p style="background:#fffbe6;padding:10px 12px;border-radius:10px"><strong>Grabar en ' + (perfiles.length > 1 ? 'los chips' : 'el chip') + ' NFC:</strong>' +
    perfiles.map(p => '<br>' + (perfiles.length > 1 && p.mascota ? e(p.mascota) + ': ' : '') + '<a href="' + e(p.urlChip) + '">' + e(p.urlChip) + '</a>').join('') + '</p>';
}

module.exports = { marcarPerfiles, htmlChips };
