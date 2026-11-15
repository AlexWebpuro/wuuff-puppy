// Almacenes de Netlify Blobs con lectura al instante ("consistencia fuerte") solo si el entorno trae la dirección
// que hace falta (uncachedEdgeURL). Las funciones de este sitio (v1 con connectLambda) no la traen, así que usan la
// lectura normal, que puede tardar en mostrar lo recién guardado: por eso el panel manda lo que acaba de guardar
// o borrar (ver inventario.fusionar) y el webhook del Black Wuuff Friday reacomoda la caja si dos se cruzan.
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
