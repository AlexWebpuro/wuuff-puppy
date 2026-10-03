// Lee (GET) y guarda (POST) el perfil de la mascota desde el enlace privado de edición.
// Solo funciona con el código del perfil y su clave privada.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const ESPECIES = ['Perro', 'Gato'];
const SEXOS = ['Macho', 'Hembra'];
const FOTO_MAX_BYTES = 1500000;

function limpiar(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}
function fecha(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}(-\d{2})?$/.test(s) ? s : '';
}
function claveValida(perfil, clave) {
  if (!perfil || typeof clave !== 'string' || clave.length !== perfil.clave.length) return false;
  return crypto.timingSafeEqual(Buffer.from(clave), Buffer.from(perfil.clave));
}
function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) };
}
function publico(perfil) {
  const copia = Object.assign({}, perfil);
  delete copia.clave;
  return copia;
}

exports.handler = async function (event) {
  connectLambda(event);
  const store = getStore('perfiles-nfc');

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    const perfil = await store.get(String(q.id || ''), { type: 'json' });
    if (!claveValida(perfil, q.clave)) return json(404, { error: 'Perfil no encontrado' });
    return json(200, { ok: true, perfil: publico(perfil) });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Método no permitido' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'JSON inválido' });
  }
  const perfil = await store.get(String(body.id || ''), { type: 'json' });
  if (!claveValida(perfil, body.clave)) return json(404, { error: 'Perfil no encontrado' });

  const d = body.datos || {};
  const m = d.mascota || {}, c = d.contacto || {}, s = d.salud || {}, v = d.veterinaria || {};
  const mascota = {
    nombre: limpiar(m.nombre, 40),
    especie: ESPECIES.includes(m.especie) ? m.especie : '',
    raza: limpiar(m.raza, 60),
    sexo: SEXOS.includes(m.sexo) ? m.sexo : '',
    nacimiento: fecha(m.nacimiento),
    color: limpiar(m.color, 60),
    esterilizado: ['Sí', 'No'].includes(m.esterilizado) ? m.esterilizado : '',
    ciudad: limpiar(m.ciudad, 60),
    senas: limpiar(m.senas, 300),
    descripcion: limpiar(m.descripcion, 500)
  };
  const contacto = {
    nombre: limpiar(c.nombre, 80),
    telefono: limpiar(c.telefono, 30),
    telefono2: limpiar(c.telefono2, 30),
    whatsapp: c.whatsapp !== false
  };
  if (!mascota.nombre || !mascota.especie || !mascota.raza || !mascota.sexo) {
    return json(400, { error: 'Nombre, especie, raza y sexo son obligatorios' });
  }
  if ((contacto.telefono.match(/\d/g) || []).length < 7) {
    return json(400, { error: 'Revisa el teléfono de contacto' });
  }

  perfil.mascota = mascota;
  perfil.contacto = contacto;
  perfil.salud = {
    alergias: limpiar(s.alergias, 300),
    condiciones: limpiar(s.condiciones, 300),
    medicamentos: limpiar(s.medicamentos, 300)
  };
  perfil.vacunas = (Array.isArray(d.vacunas) ? d.vacunas : []).slice(0, 15)
    .map(function (x) {
      return { nombre: limpiar(x && x.nombre, 60), fecha: fecha(x && x.fecha), proxima: fecha(x && x.proxima), lugar: limpiar(x && x.lugar, 80) };
    })
    .filter(function (x) { return x.nombre; });
  perfil.veterinaria = {
    nombre: limpiar(v.nombre, 80),
    telefono: limpiar(v.telefono, 30),
    direccion: limpiar(v.direccion, 120)
  };

  // Foto: llega ya reducida desde el navegador como data URL (JPEG, PNG o WebP)
  if (body.quitarFoto) {
    await store.delete('foto-' + perfil.id);
    perfil.foto = null;
  } else if (typeof body.foto === 'string' && body.foto) {
    const mt = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.foto);
    if (!mt) return json(400, { error: 'Formato de foto no válido' });
    const bytes = Buffer.from(mt[2], 'base64');
    if (bytes.length > FOTO_MAX_BYTES) return json(400, { error: 'La foto es muy pesada' });
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    await store.set('foto-' + perfil.id, ab, { metadata: { tipo: mt[1] } });
    perfil.foto = Date.now();
  }

  perfil.actualizado = new Date().toISOString();
  await store.setJSON(perfil.id, perfil);
  return json(200, { ok: true, perfil: publico(perfil) });
};
