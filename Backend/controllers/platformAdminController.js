const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const { limparTexto, normalizarEmail, emailValido, uuidValido } = require('../utils/validacao');
const { registrar } = require('../utils/auditoria');

const NIVEIS = ['admin', 'coordenador', 'operador', 'visualizador'];
const STATUS_CAMPANHA = ['planejamento', 'ativa', 'encerrada', 'arquivada'];

function senhaForte(senha) {
  return typeof senha === 'string' && senha.length >= 12 && Buffer.byteLength(senha, 'utf8') <= 72 &&
    /[A-Z]/.test(senha) && /[a-z]/.test(senha) && /[0-9]/.test(senha) && /[^A-Za-z0-9]/.test(senha);
}

async function resumo(req, res, next) {
  try {
    const resultado = await query(`SELECT
      (SELECT COUNT(*)::int FROM campanhas) AS campanhas,
      (SELECT COUNT(*)::int FROM campanhas WHERE status='ativa') AS campanhas_ativas,
      (SELECT COUNT(*)::int FROM usuarios WHERE ativo=true) AS usuarios_ativos,
      (SELECT COUNT(*)::int FROM usuarios WHERE administrador_global=true AND ativo=true) AS administradores_globais,
      (SELECT COUNT(*)::int FROM eleitores) AS eleitores,
      (SELECT COUNT(*)::int FROM auditoria WHERE criado_em > NOW()-INTERVAL '24 hours') AS eventos_24h`);
    return res.json({ dados: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function listarCampanhas(req, res, next) {
  try {
    const resultado = await query(`SELECT c.id,c.nome_candidato,c.nome_exibicao,c.cargo_politico,
      c.municipio,c.uf,c.ano_eleicao,c.status,c.tenant_slug,c.created_at,
      COUNT(u.id)::int AS usuarios,
      COUNT(u.id) FILTER (WHERE u.ativo=true)::int AS usuarios_ativos
      FROM campanhas c LEFT JOIN usuarios u ON u.campanha_id=c.id
      GROUP BY c.id ORDER BY c.created_at DESC`);
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function atualizarCampanha(req, res, next) {
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const status = req.body.status;
    const nomeExibicao = req.body.nome_exibicao === undefined ? undefined : limparTexto(req.body.nome_exibicao, 255);
    if (status !== undefined && !STATUS_CAMPANHA.includes(status)) {
      return res.status(400).json({ erro: 'Status de campanha invalido.' });
    }
    if (req.body.nome_exibicao !== undefined && !nomeExibicao) {
      return res.status(400).json({ erro: 'Nome de exibicao invalido.' });
    }
    if (status === undefined && nomeExibicao === undefined) {
      return res.status(400).json({ erro: 'Informe ao menos um campo para atualizar.' });
    }
    const anterior = await query('SELECT id,status,nome_exibicao FROM campanhas WHERE id=$1', [req.params.id]);
    if (!anterior.rows[0]) return res.status(404).json({ erro: 'Campanha nao encontrada.' });
    const resultado = await query(
      `UPDATE campanhas SET status=COALESCE($2::status_campanha,status),
       nome_exibicao=CASE WHEN $3::boolean THEN $4 ELSE nome_exibicao END,updated_at=NOW()
       WHERE id=$1 RETURNING id,nome_exibicao,status`,
      [req.params.id, status || null, nomeExibicao !== undefined, nomeExibicao || null]
    );
    await registrar({ campanha_id:req.params.id, usuario_id:req.usuario.id, acao:'campanha_atualizada_global',
      entidade:'campanha', entidade_id:req.params.id, ip:req.ip, antes:anterior.rows[0], depois:resultado.rows[0] });
    return res.json({ mensagem:'Campanha atualizada.', campanha:resultado.rows[0] });
  } catch (err) { next(err); }
}

async function listarUsuarios(req, res, next) {
  try {
    const resultado = await query(`SELECT u.id,u.campanha_id,u.nome,u.email,u.telefone,u.nivel,u.ativo,
      u.administrador_global,u.mfa_ativo,u.ultimo_acesso,u.created_at,
      c.nome_exibicao,c.nome_candidato,c.tenant_slug,(c.proprietario_usuario_id=u.id) AS proprietario
      FROM usuarios u JOIN campanhas c ON c.id=u.campanha_id
      WHERE u.email NOT LIKE 'conta-removida-%@invalid.local'
      ORDER BY u.administrador_global DESC,u.ativo DESC,u.nome`);
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function criarUsuario(req, res, next) {
  try {
    const nome = limparTexto(req.body.nome, 255);
    const email = normalizarEmail(req.body.email);
    const telefone = limparTexto(req.body.telefone, 20);
    const campanhaId = req.body.campanha_id;
    const administradorGlobal = req.body.administrador_global === true;
    const nivel = administradorGlobal ? 'admin' : req.body.nivel;
    if (!nome || !emailValido(email) || !uuidValido(campanhaId) || !NIVEIS.includes(nivel)) {
      return res.status(400).json({ erro: 'Nome, e-mail, campanha e nivel validos sao obrigatorios.' });
    }
    if (!senhaForte(req.body.senha)) {
      return res.status(400).json({ erro: 'A senha deve ter 12 caracteres, maiuscula, minuscula, numero e simbolo.' });
    }
    const campanha = await query('SELECT id FROM campanhas WHERE id=$1', [campanhaId]);
    if (!campanha.rows[0]) return res.status(404).json({ erro: 'Campanha nao encontrada.' });
    const senhaHash = await bcrypt.hash(req.body.senha, 12);
    const resultado = await query(`INSERT INTO usuarios
      (campanha_id,nivel,nome,email,senha_hash,telefone,administrador_global)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,campanha_id,nivel,nome,email,telefone,ativo,administrador_global`,
      [campanhaId,nivel,nome,email,senhaHash,telefone,administradorGlobal]);
    await registrar({ campanha_id:campanhaId, usuario_id:req.usuario.id, acao:'usuario_criado_global',
      entidade:'usuario', entidade_id:resultado.rows[0].id, ip:req.ip, antes:null,
      depois:{ nivel, administrador_global:administradorGlobal } });
    return res.status(201).json({ mensagem:'Usuario criado.', usuario:resultado.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro:'E-mail ja cadastrado.' });
    next(err);
  }
}

async function atualizarUsuario(req, res, next) {
  const client = await getClient();
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro:'Identificador invalido.' });
    await client.query('BEGIN');
    const alvo = await client.query(`SELECT id,campanha_id,nome,nivel,ativo,administrador_global
      FROM usuarios WHERE id=$1 FOR UPDATE`, [req.params.id]);
    const anterior = alvo.rows[0];
    if (!anterior) { await client.query('ROLLBACK'); return res.status(404).json({ erro:'Usuario nao encontrado.' }); }
    const nivel = req.body.nivel;
    const ativo = typeof req.body.ativo === 'boolean' ? req.body.ativo : null;
    const globalInformado = typeof req.body.administrador_global === 'boolean';
    const administradorGlobal = globalInformado ? req.body.administrador_global : anterior.administrador_global;
    if (nivel !== undefined && !NIVEIS.includes(nivel)) {
      await client.query('ROLLBACK'); return res.status(400).json({ erro:'Nivel invalido.' });
    }
    if (req.params.id === req.usuario.id && (ativo === false || administradorGlobal === false || (nivel && nivel !== 'admin'))) {
      await client.query('ROLLBACK'); return res.status(400).json({ erro:'Nao e permitido retirar o proprio acesso administrativo.' });
    }
    const nivelFinal = administradorGlobal ? 'admin' : (nivel || anterior.nivel);
    if (anterior.administrador_global && (!administradorGlobal || ativo === false)) {
      const outros = await client.query(`SELECT COUNT(*)::int AS total FROM usuarios
        WHERE administrador_global=true AND ativo=true AND id<>$1`, [req.params.id]);
      if (outros.rows[0].total === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ erro:'O sistema precisa manter ao menos um administrador global ativo.' });
      }
    }
    const nome = req.body.nome === undefined ? null : limparTexto(req.body.nome, 255);
    const telefone = req.body.telefone === undefined ? null : limparTexto(req.body.telefone, 20);
    if (req.body.nome !== undefined && !nome) {
      await client.query('ROLLBACK'); return res.status(400).json({ erro:'Nome invalido.' });
    }
    const resultado = await client.query(`UPDATE usuarios SET
      nome=COALESCE($2,nome),telefone=CASE WHEN $3::boolean THEN $4 ELSE telefone END,
      nivel=$5::nivel_acesso,ativo=COALESCE($6,ativo),administrador_global=$7,
      token_versao=token_versao+1,updated_at=NOW() WHERE id=$1
      RETURNING id,campanha_id,nome,email,nivel,ativo,administrador_global`,
      [req.params.id,nome,req.body.telefone!==undefined,telefone,nivelFinal,ativo,administradorGlobal]);
    await client.query('COMMIT');
    await registrar({ campanha_id:anterior.campanha_id, usuario_id:req.usuario.id, acao:'usuario_atualizado_global',
      entidade:'usuario', entidade_id:req.params.id, ip:req.ip, antes:anterior, depois:resultado.rows[0] });
    return res.json({ mensagem:'Usuario atualizado.', usuario:resultado.rows[0] });
  } catch (err) { await client.query('ROLLBACK').catch(function(){}); next(err); }
  finally { client.release(); }
}

async function removerUsuario(req, res, next) {
  const client = await getClient();
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro:'Identificador invalido.' });
    if (req.params.id === req.usuario.id) return res.status(400).json({ erro:'Nao e permitido remover a propria conta.' });
    await client.query('BEGIN');
    const alvo = await client.query(`SELECT u.id,u.campanha_id,u.nivel,u.ativo,u.administrador_global,
      (c.proprietario_usuario_id=u.id) AS proprietario FROM usuarios u JOIN campanhas c ON c.id=u.campanha_id
      WHERE u.id=$1 FOR UPDATE OF u`, [req.params.id]);
    const usuario = alvo.rows[0];
    if (!usuario) { await client.query('ROLLBACK'); return res.status(404).json({ erro:'Usuario nao encontrado.' }); }
    if (usuario.proprietario) { await client.query('ROLLBACK'); return res.status(403).json({ erro:'Transfira o responsavel da campanha antes de remover esta conta.' }); }
    if (usuario.administrador_global) {
      const outros = await client.query(`SELECT COUNT(*)::int AS total FROM usuarios
        WHERE administrador_global=true AND ativo=true AND id<>$1`, [req.params.id]);
      if (outros.rows[0].total === 0) { await client.query('ROLLBACK'); return res.status(409).json({ erro:'O ultimo administrador global nao pode ser removido.' }); }
    }
    const senhaHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    await client.query(`UPDATE usuarios SET nome='Conta removida',email='conta-removida-'||id||'@invalid.local',
      telefone=NULL,senha_hash=$2,ativo=false,administrador_global=false,token_versao=token_versao+1,
      mfa_ativo=false,mfa_segredo_criptografado=NULL,mfa_codigos_reserva='[]'::jsonb,updated_at=NOW()
      WHERE id=$1`, [req.params.id,senhaHash]);
    await client.query('COMMIT');
    await registrar({ campanha_id:usuario.campanha_id, usuario_id:req.usuario.id, acao:'usuario_anonimizado_global',
      entidade:'usuario', entidade_id:req.params.id, ip:req.ip, antes:{nivel:usuario.nivel,ativo:usuario.ativo},
      depois:{ativo:false,dados_pessoais:'anonimizados'} });
    return res.json({ mensagem:'Conta removida e dados pessoais anonimizados.' });
  } catch (err) { await client.query('ROLLBACK').catch(function(){}); next(err); }
  finally { client.release(); }
}

async function listarAuditoria(req, res, next) {
  try {
    const limite = Math.min(200, Math.max(1, parseInt(req.query.limit,10)||100));
    const resultado = await query(`SELECT a.id,a.acao,a.entidade,a.entidade_id,a.ip,a.criado_em,
      u.nome AS usuario_nome,u.email AS usuario_email,c.nome_exibicao,c.nome_candidato
      FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id
      LEFT JOIN campanhas c ON c.id=a.campanha_id ORDER BY a.criado_em DESC LIMIT $1`, [limite]);
    return res.json({ dados:resultado.rows });
  } catch (err) { next(err); }
}

module.exports = { resumo,listarCampanhas,atualizarCampanha,listarUsuarios,criarUsuario,
  atualizarUsuario,removerUsuario,listarAuditoria };
