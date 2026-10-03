// Crea el perfil de la mascota para la placa NFC al momento de la compra.
// Recibe los datos básicos (obligatorios) y devuelve el código público del perfil
// (el que se graba en el chip: https://wuuffpuppy.co/m/<id>) y la clave privada
// con la que el cliente completa o edita el perfil después.
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L para que no se confundan

function codigo(n) {
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}

function limpiar(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const ESPECIES = ['Perro', 'Gato'];
const SEXOS = ['Macho', 'Hembra'];

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }
  if (body.botField) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, id: 'X', clave: 'X' }) };
  }

  const mascota = {
    nombre: limpiar(body.mascota, 40),
    especie: ESPECIES.includes(body.especie) ? body.especie : '',
    raza: limpiar(body.raza, 60),
    sexo: SEXOS.includes(body.sexo) ? body.sexo : '',
    ciudad: limpiar(body.ciudad, 60)
  };
  const contacto = {
    nombre: limpiar(body.contactoNombre, 80),
    telefono: limpiar(body.telefono, 30)
  };
  if (!mascota.nombre || !mascota.especie || !mascota.raza || !mascota.sexo) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Faltan los datos básicos de la mascota' }) };
  }
  if ((contacto.telefono.match(/\d/g) || []).length < 7) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Teléfono inválido' }) };
  }

  connectLambda(event);
  const store = getStore({ name: 'perfiles-nfc', consistency: 'strong' });

  // Código público de 10 caracteres (≈ 49 bits): imposible de adivinar recorriendo códigos
  let id = codigo(10);
  for (let i = 0; i < 3 && (await store.get(id)); i++) id = codigo(10);

  const ahora = new Date().toISOString();
  const perfil = {
    id: id,
    clave: crypto.randomBytes(18).toString('hex'),
    creado: ahora,
    actualizado: ahora,
    activo: true,
    pedido: { estado: 'pendiente', correo: limpiar(body.correo, 160) },
    mascota: mascota,
    contacto: contacto,
    salud: {},
    vacunas: [],
    veterinaria: {},
    foto: null
  };
  await store.setJSON(id, perfil);

  console.log('Perfil NFC creado', id, mascota.nombre);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, id: id, clave: perfil.clave })
  };
};
