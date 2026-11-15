// Almacenes de Netlify Blobs con lectura al instante ("consistencia fuerte") cuando el entorno lo permite.
// Las funciones v2 (.mjs) traen la dirección que hace falta (uncachedEdgeURL); las v1 con connectLambda no,
// y ahí pedir lectura fuerte falla. Por eso se pide solo si está disponible; si no, se usa la normal
// (que puede tardar hasta un minuto en mostrar lo recién guardado).
const { getStore } = require('@netlify/blobs');

function hayLecturaFuerte() {
  try {
    const raw = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
    if (!raw) return false;
    return !!JSON.parse(Buffer.from(String(raw), 'base64').toString()).uncachedEdgeURL;
  } catch (e) { return false; }
}
function almacen(nombre) {
  return hayLecturaFuerte() ? getStore({ name: nombre, consistency: 'strong' }) : getStore(nombre);
}
module.exports = { almacen, hayLecturaFuerte };
