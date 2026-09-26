// Verifica el estado real de una transacción de Wompi desde el servidor.
// Wompi ya no permite consultar transacciones directo desde el navegador,
// así que esta función hace de intermediario seguro.
exports.handler = async function (event) {
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el id de la transacción' }) };
  }

  // Llave pública de producción (no es secreta, se puede usar aquí sin problema)
  const PUBLIC_KEY = 'pub_prod_bMJoSYDpbi1X897N35gXBmAZ5OArOgJr';

  try {
    const resp = await fetch(`https://production.wompi.co/v1/transactions/${id}`, {
      headers: { Authorization: `Bearer ${PUBLIC_KEY}` }
    });

    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: 'No se pudo consultar la transacción' }) };
    }

    const json = await resp.json();
    const status = json && json.data && json.data.status;
    const reference = json && json.data && json.data.reference;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status, reference: reference })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Error de conexión con Wompi' }) };
  }
};
