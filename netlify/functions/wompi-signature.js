// Calcula la firma de integridad de Wompi en el servidor,
// para que el Secreto de Integridad nunca quede expuesto en el navegador.
const crypto = require('crypto');

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

  const { reference, amountInCents } = body;

  if (!reference || !amountInCents) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Faltan los campos reference o amountInCents' })
    };
  }

  const secret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Falta configurar la variable de entorno WOMPI_INTEGRITY_SECRET en Netlify' })
    };
  }

  const cadenaConcatenada = `${reference}${amountInCents}COP${secret}`;
  const signature = crypto.createHash('sha256').update(cadenaConcatenada).digest('hex');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signature })
  };
};
