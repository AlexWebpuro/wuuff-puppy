// Todos los días a las 9:00 a. m. (hora de Colombia) les escribe a los clientes que compraron hace
// 7 días (Bogotá) o 10 días (resto del país) para pedirles su reseña. Los pedidos por invitar los guardan
// pedido-contraentrega y wompi-webhook en el store "resenas-invitaciones".
import { getStore } from '@netlify/blobs';
import R from '../lib/resenas.js';

export default async () => {
  const enviadas = await R.invitarPendientes(getStore('resenas-invitaciones'));
  console.log('Invitaciones a reseñar enviadas:', enviadas);
  return new Response('ok');
};

export const config = { schedule: '0 14 * * *' };
