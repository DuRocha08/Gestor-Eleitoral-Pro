// auditoria.js - registra acoes importantes no banco pra rastreabilidade
const { query } = require('../config/db');

const ACOES = {
  IMPORT_INICIADO:    'import_iniciado',
  IMPORT_CONCLUIDO:   'import_concluido',
  IMPORT_FALHA:       'import_falha',
  ELEITOR_CRIADO:     'eleitor_criado',
  ELEITOR_ATUALIZADO: 'eleitor_atualizado',
  ELEITOR_EXCLUIDO:   'eleitor_excluido',
  LOGIN:              'login',
  LOGIN_SUCESSO:      'login_sucesso',
  LOGIN_FALHA:        'login_falha',
  LOGOUT:             'logout',
  CONTA_CRIADA:       'conta_criada',
  USUARIO_CRIADO:     'usuario_criado',
  USUARIO_ATUALIZADO: 'usuario_atualizado',
  MFA_ATIVADO:        'mfa_ativado',
  MFA_DESATIVADO:     'mfa_desativado',
  DEMANDA_CRIADA:     'demanda_criada',
  DEMANDA_ATUALIZADA: 'demanda_atualizada',
};

async function registrar({ campanha_id, usuario_id, acao, entidade, entidade_id, ip, antes, depois }) {
  try {
    const sql = `INSERT INTO auditoria
      (campanha_id, usuario_id, acao, entidade, entidade_id, ip, antes, depois, criado_em)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`;

    await query(sql, [
      campanha_id,
      usuario_id,
      acao,
      entidade,
      entidade_id ? String(entidade_id) : null,
      ip || null,
      antes  ? JSON.stringify(antes)  : null,
      depois ? JSON.stringify(depois) : null,
    ]);
  } catch (err) {
    // se a auditoria falhar, nao quero travar o sistema
    console.warn('[auditoria] nao conseguiu registrar:', process.env.NODE_ENV === 'production' ? (err.code || err.name) : err.message);
  }
}

module.exports = { registrar, ACOES };
