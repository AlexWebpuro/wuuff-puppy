// Estado de la promo del Black Wuuff Friday con la hora del SERVIDOR (no la del celular del cliente).
// GET /.netlify/functions/promo → { fase: 'activa' | 'teaser' | null, id, fin, descuento, nombreGratisEn, cupos, nombresLibres }
// En las vistas previas de Netlify se puede simular la fecha con ?simular=jueves|promo|despues.
const { getStore, connectLambda } = require('@netlify/blobs');
const tienda = require('../lib/tienda');

exports.handler = async (event) => {
  const ahora = tienda.ahoraDe(event);
  const fase = tienda.fasePromo(ahora);
  const p = tienda.PROMO || {};
  let nombresLibres = null;
  if (fase && p.nombreGratisCupos > 0) {
    try { connectLambda(event); nombresLibres = await tienda.cuposNombreLibres(getStore('promo-marcas')); }
    catch (err) { nombresLibres = Math.max(0, p.nombreGratisCupos - (parseInt(p.nombreGratisVendidosAparte, 10) || 0)); }
  }
  const cuerpo = fase ? { fase, id: p.id, inicio: p.inicio, fin: p.fin, descuento: p.descuento || 0, nombreGratisEn: nombresLibres === 0 ? [] : p.nombreGratisEn,
    cupos: p.nombreGratisCupos || null, nombresLibres, regaloStickers: !!p.regaloStickers, regaloPrimerPedido: !!p.regaloPrimerPedido } : { fase: null };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
    body: JSON.stringify(cuerpo)
  };
};
