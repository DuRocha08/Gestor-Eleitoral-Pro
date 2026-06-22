function urlAlerta() {
  if (!process.env.ALERT_WEBHOOK_URL) return null;
  try {
    const url = new URL(process.env.ALERT_WEBHOOK_URL);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch (_) { return null; }
}

async function enviarAlertaErro(dados) {
  const url = urlAlerta();
  if (!url || process.env.NODE_ENV !== 'production') return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texto: 'Erro interno no Gestor Eleitoral',
      request_id: dados.requestId,
      codigo: dados.codigo,
      rota: dados.rota,
      horario: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });
}

module.exports = { enviarAlertaErro };
