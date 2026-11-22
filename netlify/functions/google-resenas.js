// Reseñas de Google del Perfil de Negocio de Wuuff Puppy, para mostrarlas en el inicio.
// GET /.netlify/functions/google-resenas → { configurado, rating, total, url, escribir, resenas: [...] }
//
// Usa la API de Google Places (New). Necesita en Netlify (variables de entorno):
//   GOOGLE_PLACES_KEY  → la llave de la API (la pega la dueña directamente en Netlify; nunca en el código)
//   GOOGLE_PLACE_ID    → opcional: el id del negocio. Si no está, se busca una vez por nombre ("Wuuff Puppy").
// Google entrega como máximo 5 reseñas (las más relevantes). Se guardan 12 horas en Netlify Blobs
// ("google-resenas") para no gastar consultas; si Google falla, se sigue mostrando lo último guardado.
// Sin llave responde { configurado: false } y la página muestra solo los botones para ver y dejar reseñas.
const { getStore, connectLambda } = require('@netlify/blobs');

const ESCRIBIR = 'https://g.page/r/CYtp9VSFSfteEBM/review'; // enlace directo para dejar la reseña
const DURACION_MS = 12 * 3600 * 1000;
const BUSQUEDA = process.env.GOOGLE_PLACE_BUSQUEDA || 'Wuuff Puppy Bogotá';

function respuesta(cuerpo, segundos) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=' + (segundos || 600) }, body: JSON.stringify(cuerpo) };
}

async function buscarId(llave) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': llave, 'X-Goog-FieldMask': 'places.id,places.displayName' },
    body: JSON.stringify({ textQuery: BUSQUEDA, languageCode: 'es', regionCode: 'CO' })
  });
  if (!r.ok) throw new Error('Google (búsqueda) respondió ' + r.status);
  const j = await r.json();
  const lugar = (j.places || [])[0];
  if (!lugar) throw new Error('Google no encontró "' + BUSQUEDA + '"');
  return lugar.id;
}

async function traerDeGoogle(llave, id) {
  const r = await fetch('https://places.googleapis.com/v1/places/' + encodeURIComponent(id) + '?languageCode=es&regionCode=CO', {
    headers: { 'X-Goog-Api-Key': llave, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri' }
  });
  if (!r.ok) throw new Error('Google (detalle) respondió ' + r.status);
  const j = await r.json();
  return {
    configurado: true,
    rating: j.rating || 0,
    total: j.userRatingCount || 0,
    url: j.googleMapsUri || '',
    escribir: ESCRIBIR,
    resenas: (j.reviews || []).map(v => ({
      autor: (v.authorAttribution && v.authorAttribution.displayName) || 'Cliente de Google',
      foto: (v.authorAttribution && v.authorAttribution.photoUri) || '',
      perfil: (v.authorAttribution && v.authorAttribution.uri) || '',
      estrellas: v.rating || 0,
      texto: (v.text && v.text.text) || (v.originalText && v.originalText.text) || '',
      cuando: v.relativePublishTimeDescription || '',
      fecha: v.publishTime || '',
      url: v.googleMapsUri || ''
    })).filter(v => v.texto)
  };
}

exports.handler = async (event) => {
  const llave = process.env.GOOGLE_PLACES_KEY;
  if (!llave) return respuesta({ configurado: false, escribir: ESCRIBIR, resenas: [] }, 600);
  try { connectLambda(event); } catch (e) { /* fuera de Netlify (pruebas) */ }
  let store = null, guardado = null;
  try { store = getStore('google-resenas'); guardado = await store.get('cache', { type: 'json' }); } catch (e) { store = null; }
  if (guardado && guardado.datos && Date.now() - guardado.t < DURACION_MS) return respuesta(guardado.datos, 3600);
  try {
    const id = process.env.GOOGLE_PLACE_ID || (guardado && guardado.id) || await buscarId(llave);
    const datos = await traerDeGoogle(llave, id);
    if (store) await store.setJSON('cache', { t: Date.now(), id, datos }).catch(() => {});
    return respuesta(datos, 3600);
  } catch (err) {
    console.error('Reseñas de Google:', err.message);
    if (guardado && guardado.datos) return respuesta(guardado.datos, 600); // lo último que funcionó
    return respuesta({ configurado: true, error: true, escribir: ESCRIBIR, resenas: [] }, 300);
  }
};
