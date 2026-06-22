const crypto = require('crypto');

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function codificarBase32(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let saida = '';
  for (let i = 0; i < bits.length; i += 5) {
    saida += ALFABETO_BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return saida;
}

function decodificarBase32(texto) {
  const limpo = String(texto || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const caractere of limpo) {
    const indice = ALFABETO_BASE32.indexOf(caractere);
    if (indice < 0) throw new Error('Segredo MFA invalido.');
    bits += indice.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function gerarSegredo() {
  return codificarBase32(crypto.randomBytes(20));
}

function gerarCodigoTotp(segredo, instante = Date.now()) {
  const contador = Math.floor(instante / 1000 / 30);
  const mensagem = Buffer.alloc(8);
  mensagem.writeBigUInt64BE(BigInt(contador));
  const hash = crypto.createHmac('sha1', decodificarBase32(segredo)).update(mensagem).digest();
  const deslocamento = hash[hash.length - 1] & 0x0f;
  const numero = (hash.readUInt32BE(deslocamento) & 0x7fffffff) % 1000000;
  return String(numero).padStart(6, '0');
}

function verificarCodigoTotp(segredo, codigo) {
  const recebido = String(codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(recebido)) return false;
  for (const janela of [-1, 0, 1]) {
    const esperado = gerarCodigoTotp(segredo, Date.now() + janela * 30000);
    if (crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) return true;
  }
  return false;
}

function chaveCriptografia() {
  const segredo = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (segredo.length < 32) throw new Error('Chave de criptografia MFA nao configurada.');
  return crypto.createHash('sha256').update('gestor-eleitoral:mfa:' + segredo).digest();
}

function criptografarSegredo(segredo) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chaveCriptografia(), iv);
  const dados = Buffer.concat([cifra.update(segredo, 'utf8'), cifra.final()]);
  return [iv, cifra.getAuthTag(), dados].map(parte => parte.toString('base64url')).join('.');
}

function descriptografarSegredo(valor) {
  const [iv, tag, dados] = String(valor || '').split('.').map(parte => Buffer.from(parte, 'base64url'));
  if (!iv || !tag || !dados) throw new Error('Segredo MFA corrompido.');
  const decifra = crypto.createDecipheriv('aes-256-gcm', chaveCriptografia(), iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(dados), decifra.final()]).toString('utf8');
}

function gerarCodigosReserva() {
  return Array.from({ length: 8 }, function() {
    return crypto.randomBytes(5).toString('hex').toUpperCase();
  });
}

function montarUri(segredo, email) {
  const emissor = 'Gestor Eleitoral';
  const rotulo = encodeURIComponent(emissor + ':' + email);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  gerarSegredo,
  gerarCodigoTotp,
  verificarCodigoTotp,
  criptografarSegredo,
  descriptografarSegredo,
  gerarCodigosReserva,
  montarUri,
};
