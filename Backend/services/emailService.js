function configurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM && process.env.FRONTEND_URL);
}

async function enviarRecuperacaoSenha(email, token) {
  if (!configurado()) return { enviado: false, motivo: 'servico_nao_configurado' };
  const base = new URL(process.env.FRONTEND_URL);
  base.pathname = base.pathname.replace(/\/$/, '') + '/reset-password';
  base.searchParams.set('token', token);

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM,
      to: [email],
      subject: 'Redefinicao de senha - Gestor Eleitoral',
      text: `Use este link em ate 30 minutos para redefinir sua senha: ${base.toString()}`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resposta.ok) throw new Error('Falha ao enviar e-mail de recuperacao.');
  return { enviado: true };
}

module.exports = { enviarRecuperacaoSenha, configurado };
