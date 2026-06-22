const { query } = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { limparTexto, uuidValido } = require('../utils/validacao');
const { registrar, ACOES } = require('../utils/auditoria');

const NIVEIS_GERENCIAVEIS = ['coordenador', 'operador', 'visualizador'];

async function listar(req, res, next) {
  try {
    const resultado = await query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.nivel, u.ativo, u.ultimo_acesso, u.created_at,
       (c.proprietario_usuario_id=u.id) AS proprietario,
       COALESCE((to_jsonb(u)->>'mfa_ativo')::boolean, false) AS mfa_ativo
       FROM usuarios u JOIN campanhas c ON c.id=u.campanha_id
       WHERE u.campanha_id=$1
         AND COALESCE((to_jsonb(u)->>'administrador_global')::boolean, false)=false
         AND u.email NOT LIKE 'conta-removida-%@invalid.local'
       ORDER BY u.ativo DESC, u.nome ASC`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try {
    const id = req.params.id;
    if (!uuidValido(id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    if (id === req.usuario.id && (req.body.ativo === false || req.body.nivel)) {
      return res.status(400).json({ erro: 'Nao e permitido desativar ou alterar o proprio nivel.' });
    }
    const nivel = req.body.nivel;
    if (nivel !== undefined && !NIVEIS_GERENCIAVEIS.includes(nivel)) {
      return res.status(400).json({ erro: 'Nivel de acesso invalido.' });
    }
    const nome = req.body.nome === undefined ? null : limparTexto(req.body.nome, 255);
    const telefone = req.body.telefone === undefined ? null : limparTexto(req.body.telefone, 20);
    const ativo = typeof req.body.ativo === 'boolean' ? req.body.ativo : null;
    if (req.body.nome !== undefined && !nome) return res.status(400).json({ erro: 'Nome invalido.' });

    const anterior = await query(
      `SELECT u.id,u.nome,u.nivel,u.ativo,
       COALESCE((to_jsonb(u)->>'administrador_global')::boolean, false) AS administrador_global,
       (c.proprietario_usuario_id=u.id) AS proprietario,
       (c.proprietario_usuario_id=$3) AS solicitante_proprietario
       FROM usuarios u JOIN campanhas c ON c.id=u.campanha_id
       WHERE u.id=$1 AND u.campanha_id=$2`,
      [id, req.usuario.campanha_id, req.usuario.id]
    );
    if (!anterior.rows[0]) return res.status(404).json({ erro: 'Usuario nao encontrado.' });
    if (anterior.rows[0].administrador_global) {
      return res.status(403).json({ erro: 'O administrador global so pode ser alterado na gestao da plataforma.' });
    }
    if (anterior.rows[0].nivel === 'admin' && req.usuario.nivel !== 'admin') {
      return res.status(403).json({ erro: 'Somente administrador pode alterar outro administrador.' });
    }
    const podeGerenciarCoordenador = req.usuario.nivel === 'admin' || anterior.rows[0].solicitante_proprietario;
    if ((anterior.rows[0].nivel === 'coordenador' || nivel === 'coordenador') && !podeGerenciarCoordenador) {
      return res.status(403).json({ erro: 'Somente o responsavel principal pode gerenciar coordenadores.' });
    }
    if (anterior.rows[0].proprietario && (ativo === false || nivel)) {
      return res.status(403).json({ erro: 'O responsavel principal nao pode ser desativado ou ter o nivel alterado.' });
    }

    const resultado = await query(
      `UPDATE usuarios SET nome=COALESCE($3,nome), telefone=CASE WHEN $4::boolean THEN $5 ELSE telefone END,
       nivel=COALESCE($6::nivel_acesso,nivel), ativo=COALESCE($7,ativo),
       token_versao=CASE WHEN $6 IS NOT NULL OR $7 IS NOT NULL THEN token_versao+1 ELSE token_versao END,
       updated_at=NOW()
       WHERE id=$1 AND campanha_id=$2
       RETURNING id,nome,email,telefone,nivel,ativo,ultimo_acesso`,
      [id, req.usuario.campanha_id, nome, req.body.telefone !== undefined, telefone, nivel || null, ativo]
    );
    await registrar({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: ACOES.USUARIO_ATUALIZADO, entidade: 'usuario', entidade_id: id,
      ip: req.ip, antes: anterior.rows[0], depois: resultado.rows[0],
    });
    return res.json({ mensagem: 'Usuario atualizado.', usuario: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function remover(req, res, next) {
  try {
    const id = req.params.id;
    if (!uuidValido(id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Nao e permitido remover a propria conta.' });
    const alvo = await query(
      `SELECT u.id,u.nome,u.email,u.nivel,u.ativo,
       COALESCE((to_jsonb(u)->>'administrador_global')::boolean, false) AS administrador_global,
       (c.proprietario_usuario_id=u.id) AS proprietario,
       (c.proprietario_usuario_id=$3) AS solicitante_proprietario
       FROM usuarios u JOIN campanhas c ON c.id=u.campanha_id
       WHERE u.id=$1 AND u.campanha_id=$2`,
      [id, req.usuario.campanha_id, req.usuario.id]
    );
    const usuario = alvo.rows[0];
    if (!usuario) return res.status(404).json({ erro: 'Usuario nao encontrado.' });
    if (usuario.administrador_global) {
      return res.status(403).json({ erro: 'O administrador global so pode ser removido na gestao da plataforma.' });
    }
    if (usuario.proprietario) return res.status(403).json({ erro: 'O responsavel principal nao pode ser removido.' });
    if (usuario.nivel === 'admin' && req.usuario.nivel !== 'admin') {
      return res.status(403).json({ erro: 'Somente administrador pode remover outro administrador.' });
    }
    if (usuario.nivel === 'coordenador' &&
        req.usuario.nivel !== 'admin' && !usuario.solicitante_proprietario) {
      return res.status(403).json({ erro: 'Somente o responsavel principal pode remover coordenadores.' });
    }
    const senhaAleatoria = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const removido = await query(
      `UPDATE usuarios SET nome='Conta removida',
       email='conta-removida-' || id || '@invalid.local', telefone=NULL,
       senha_hash=$3, ativo=false, token_versao=token_versao+1,
       tentativas_login_falhas=0, bloqueado_ate=NULL,
       mfa_ativo=false,mfa_segredo_criptografado=NULL,mfa_codigos_reserva='[]'::jsonb,
       updated_at=NOW() WHERE id=$1 AND campanha_id=$2 RETURNING id,ativo`,
      [id, req.usuario.campanha_id, senhaAleatoria]
    );
    await registrar({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: 'usuario_anonimizado', entidade: 'usuario', entidade_id: id, ip: req.ip,
      antes: { nivel: usuario.nivel, ativo: usuario.ativo },
      depois: { ativo: false, dados_pessoais: 'anonimizados' },
    });
    return res.json({ mensagem: 'Conta removida e dados pessoais anonimizados.', usuario: removido.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listar, atualizar, remover };
