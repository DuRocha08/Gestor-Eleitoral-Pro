// gera um slug unico pra identificar cada campanha (tenant)
const crypto = require('crypto');

function gerarTenantSlug(nomeCandidato, cargoPolitico) {
  const nome = nomeCandidato
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30) || 'campanha';

  const cargo = (cargoPolitico || 'cargo')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, 15);

  // O sufixo aleatorio evita colisao entre cadastros simultaneos.
  const sufixo = crypto.randomBytes(6).toString('hex');

  return `${nome}-${cargo}-${sufixo}`;
}

module.exports = { gerarTenantSlug };
