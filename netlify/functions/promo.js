// Estado de la promo del Black Wuuff Friday con la hora del SERVIDOR (no la del celular del cliente).
// GET /.netlify/functions/promo → { fase: 'activa' | 'teaser' | null, id, fin, nombreGratisEn }
// En las vistas previas de Netlify se puede simular la fecha con ?simular=jueves|promo|despues.
const tienda = require('../lib/tienda');

exports.handler = async (event) => {
  const ahora = tienda.ahoraDe(event);
  const fase = tienda.fasePromo(ahora);
  const p = tienda.PROMO || {};
  const cuerpo = fase ? { fase, id: p.id, inicio: p.inicio, fin: p.fin, nombreGratisEn: p.nombreGratisEn, regaloStickers: !!p.regaloStickers, regaloPrimerPedido: !!p.regaloPrimerPedido } : { fase: null };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
    body: JSON.stringify(cuerpo)
  };
};
