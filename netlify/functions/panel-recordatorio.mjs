// Recordatorio diario por correo, a las 8:00 a. m. (hora de Colombia), con los pedidos pendientes del panel:
// por confirmar, por despachar (marca los que llevan 2 o más días hábiles) y entregados sin marcar como pagados.
// Si no hay nada pendiente, no manda correo. Llega al correo de la tienda (RESEND_REPLY_TO o wuuffpuppy@gmail.com).
import { getStore } from '@netlify/blobs';
import P from '../lib/panel.js';
import R from '../lib/resenas.js';

export default async () => {
  const porId = await P.listaConContraentrega(getStore(P.STORE), getStore('pedidos-contraentrega'));
  const correo = P.correoRecordatorio(Array.from(porId.values()), R.SITIO + '/', Date.now());
  if (!correo) { console.log('Sin pedidos pendientes: no se manda recordatorio'); return new Response('ok'); }
  const ok = await R.enviarCorreo(R.TIENDA_CORREO(), correo.asunto, correo.html);
  console.log('Recordatorio de pedidos enviado:', ok);
  return new Response('ok');
};

export const config = { schedule: '0 13 * * *' };
