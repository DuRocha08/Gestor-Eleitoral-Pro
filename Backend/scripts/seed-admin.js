require('dotenv').config();
const bcrypt = require('bcrypt');
const { query, encerrarPool } = require('../config/db');
const { normalizarEmail, emailValido, uuidValido } = require('../utils/validacao');

function senhaForte(senha) {
  return typeof senha === 'string' && senha.length >= 12 && Buffer.byteLength(senha, 'utf8') <= 72 &&
    /[A-Z]/.test(senha) && /[a-z]/.test(senha) && /[0-9]/.test(senha) && /[^A-Za-z0-9]/.test(senha);
}

async function executar() {
  const existente = await query('SELECT id FROM usuarios WHERE administrador_global=true AND ativo=true LIMIT 1');
  if (existente.rows[0]) {
    console.log('[SEED] ja existe um administrador global ativo. Nenhuma conta foi alterada.');
    return;
  }

  const nome = String(process.env.ADMIN_NAME || '').trim();
  const email = normalizarEmail(process.env.ADMIN_EMAIL);
  const senha = process.env.ADMIN_PASSWORD;
  const campanhaId = String(process.env.ADMIN_CAMPAIGN_ID || '').trim();
  if (!nome || !emailValido(email) || !uuidValido(campanhaId) || !senhaForte(senha)) {
    throw new Error('Defina ADMIN_NAME, ADMIN_EMAIL, ADMIN_CAMPAIGN_ID e uma ADMIN_PASSWORD forte.');
  }

  const campanha = await query('SELECT id FROM campanhas WHERE id=$1', [campanhaId]);
  if (!campanha.rows[0]) throw new Error('ADMIN_CAMPAIGN_ID nao corresponde a uma campanha existente.');

  const senhaHash = await bcrypt.hash(senha, 12);
  const usuario = await query('SELECT id,campanha_id FROM usuarios WHERE email=$1', [email]);
  if (usuario.rows[0]) {
    if (usuario.rows[0].campanha_id !== campanhaId) {
      throw new Error('A conta existente pertence a outra campanha. Use o ID atual dela.');
    }
    await query(`UPDATE usuarios SET nivel='admin',administrador_global=true,
      nome=$2,senha_hash=$3,ativo=true,token_versao=token_versao+1,updated_at=NOW() WHERE id=$1`,
      [usuario.rows[0].id,nome,senhaHash]);
  } else {
    await query(`INSERT INTO usuarios (campanha_id,nivel,nome,email,senha_hash,administrador_global)
      VALUES ($1,'admin',$2,$3,$4,true)`, [campanhaId,nome,email,senhaHash]);
  }
  console.log('[SEED] administrador global criado. Ative o MFA antes de usar a gestao da plataforma.');
}

executar().catch(function(err) {
  console.error('[SEED] falha:', err.message);
  process.exitCode = 1;
}).finally(encerrarPool);
