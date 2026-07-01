const nodemailer = require('nodemailer');

function smtpConfigurado() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.PASSWORD_RESET_FROM &&
    process.env.FRONTEND_URL
  );
}

function resendConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM && process.env.FRONTEND_URL);
}

function configurado() {
  return smtpConfigurado() || resendConfigurado();
}

function montarLinkRecuperacao(token) {
  const base = new URL(process.env.FRONTEND_URL);
  base.pathname = base.pathname.replace(/\/$/, '') + '/reset-password';
  base.searchParams.set('token', token);
  return base.toString();
}

function montarMensagem(email, link) {
  return {
    from: process.env.PASSWORD_RESET_FROM,
    to: email,
    subject: 'Redefinicao de senha - Gestor Eleitoral',
    text: `Use este link em ate 30 minutos para redefinir sua senha: ${link}`,
  };
}

async function enviarPorSmtp(email, link) {
  const port = Number(process.env.SMTP_PORT);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  await transporter.sendMail(montarMensagem(email, link));
  return { enviado: true, provedor: 'smtp' };
}

async function enviarPorResend(email, link) {
  const mensagem = montarMensagem(email, link);
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(Object.assign({}, mensagem, { to: [email] })),
    signal: AbortSignal.timeout(10000),
  });

  if (!resposta.ok) throw new Error('Falha ao enviar e-mail de recuperacao.');
  return { enviado: true, provedor: 'resend' };
}

async function enviarRecuperacaoSenha(email, token) {
  if (!configurado()) return { enviado: false, motivo: 'servico_nao_configurado' };

  const link = montarLinkRecuperacao(token);
  if (smtpConfigurado()) return enviarPorSmtp(email, link);
  return enviarPorResend(email, link);
}

module.exports = {
  enviarRecuperacaoSenha,
  configurado,
  smtpConfigurado,
  resendConfigurado,
};
