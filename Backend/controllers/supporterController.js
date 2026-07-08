const { query } = require('../config/db');
const { limparTexto, normalizarCpf, normalizarEmail, emailValido, uuidValido } = require('../utils/validacao');
const { registrar } = require('../utils/auditoria');

function montarDados(body) {
  const email = normalizarEmail(body.email);
  return {
    nome: limparTexto(body.nome),
    cpf: normalizarCpf(body.cpf),
    telefone: limparTexto(body.telefone, 20),
    whatsapp: limparTexto(body.whatsapp, 20),
    email,
    endereco: limparTexto(body.endereco),
    bairro: limparTexto(body.bairro, 150),
    cidade: limparTexto(body.cidade, 150),
    uf: limparTexto(body.uf, 2),
    ra: limparTexto(body.ra, 150),
    meta_cadastros: Number(body.meta_cadastros || 0),
    meta_votos: Number(body.meta_votos || 0),
    votos_estimados: Number(body.votos_estimados || 0),
    lider_politico: Boolean(body.lider_politico),
    nivel_influencia: body.nivel_influencia || 'medio',
    status: body.status || 'ativo',
    observacoes: limparTexto(body.observacoes, 2000),
    supervisor_id: body.supervisor_id || null,
  };
}

async function supervisorValido(supervisorId, campanhaId) {
  if (!supervisorId) return true;
  if (!uuidValido(supervisorId)) return false;
  const resultado = await query(
    'SELECT id FROM apoiadores WHERE id = $1 AND campanha_id = $2',
    [supervisorId, campanhaId]
  );
  return resultado.rowCount > 0;
}

function validar(dados) {
  if (!dados.nome) return 'Nome e obrigatorio.';
  if (dados.email && !emailValido(dados.email)) return 'E-mail invalido.';
  if (dados.meta_cadastros < 0 || dados.meta_votos < 0 || dados.votos_estimados < 0) {
    return 'Metas e votos estimados nao podem ser negativos.';
  }
  if (!['baixo', 'medio', 'alto'].includes(dados.nivel_influencia)) return 'Nivel de influencia invalido.';
  if (!['ativo', 'inativo', 'pendente'].includes(dados.status)) return 'Status invalido.';
  return null;
}

async function listar(req, res, next) {
  try {
    const condicoes = ['a.campanha_id = $1'];
    const params = [req.usuario.campanha_id];
    let i = 2;

    if (req.query.busca) {
      condicoes.push(`(a.nome ILIKE $${i} OR a.bairro ILIKE $${i} OR a.cidade ILIKE $${i})`);
      params.push('%' + req.query.busca + '%');
      i += 1;
    }
    if (req.query.bairro) {
      condicoes.push(`a.bairro ILIKE $${i}`);
      params.push('%' + req.query.bairro + '%');
      i += 1;
    }
    if (req.query.lider_politico === 'true') condicoes.push('a.lider_politico = true');
    if (req.query.ra) {
      condicoes.push(`a.ra ILIKE $${i}`);
      params.push('%' + req.query.ra + '%');
      i += 1;
    }

    const resultado = await query(
      `SELECT a.*, sup.nome AS supervisor_nome
       FROM apoiadores a
       LEFT JOIN apoiadores sup ON sup.id = a.supervisor_id
       WHERE ${condicoes.join(' AND ')}
       ORDER BY a.ativo DESC, a.nome ASC
       LIMIT 200`,
      params
    );

    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function dashboard(req, res, next) {
  try {
    const resumo = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ativo = true)::int AS ativos,
        COUNT(*) FILTER (WHERE status = 'ativo')::int AS status_ativos,
        COUNT(*) FILTER (WHERE lider_politico = true)::int AS lideres,
        COALESCE(SUM(votos_estimados),0)::int AS votos_estimados,
        COALESCE(SUM(meta_votos),0)::int AS meta_votos,
        COALESCE(SUM(votos_confirmados),0)::int AS votos_confirmados
       FROM apoiadores WHERE campanha_id = $1`,
      [req.usuario.campanha_id]
    );
    const bairros = await query(
      `SELECT COALESCE(bairro, 'Sem bairro') AS bairro, COUNT(*)::int AS total,
              COALESCE(SUM(votos_estimados),0)::int AS votos_estimados
       FROM apoiadores
       WHERE campanha_id = $1
       GROUP BY COALESCE(bairro, 'Sem bairro')
       ORDER BY total DESC
       LIMIT 10`,
      [req.usuario.campanha_id]
    );
    const ras = await query(
      `SELECT COALESCE(ra, 'Sem RA') AS ra, COUNT(*)::int AS total,
              COALESCE(SUM(votos_estimados),0)::int AS votos_estimados
       FROM apoiadores
       WHERE campanha_id = $1
       GROUP BY COALESCE(ra, 'Sem RA')
       ORDER BY total DESC
       LIMIT 10`,
      [req.usuario.campanha_id]
    );
    return res.json({ resumo: resumo.rows[0], bairros: bairros.rows, ras: ras.rows });
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem cadastrar apoiadores.' });
    }
    const dados = montarDados(req.body);
    const erro = validar(dados);
    if (erro) return res.status(400).json({ erro });
    if (!(await supervisorValido(dados.supervisor_id, req.usuario.campanha_id))) {
      return res.status(403).json({ erro: 'Lideranca superior nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO apoiadores
       (campanha_id, supervisor_id, nome, cpf, telefone, whatsapp, email, endereco, bairro, cidade,
        uf, ra, meta_cadastros, meta_votos, votos_estimados, lider_politico,
        nivel_influencia, status, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        req.usuario.campanha_id, dados.supervisor_id, dados.nome, dados.cpf,
        dados.telefone, dados.whatsapp, dados.email, dados.endereco, dados.bairro,
        dados.cidade, dados.uf, dados.ra, dados.meta_cadastros, dados.meta_votos,
        dados.votos_estimados, dados.lider_politico, dados.nivel_influencia,
        dados.status, dados.observacoes,
      ]
    );

    await registrar({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: 'apoiador_criado', entidade: 'apoiador', entidade_id: resultado.rows[0].id,
      ip: req.ip, antes: null, depois: { nome: resultado.rows[0].nome },
    });

    return res.status(201).json({ mensagem: 'Apoiador cadastrado.', apoiador: resultado.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Apoiador ja cadastrado.' });
    next(err);
  }
}

async function atualizar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem editar apoiadores.' });
    }
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const dados = montarDados(req.body);
    if (dados.email && !emailValido(dados.email)) return res.status(400).json({ erro: 'E-mail invalido.' });
    if (!(await supervisorValido(dados.supervisor_id, req.usuario.campanha_id))) {
      return res.status(403).json({ erro: 'Lideranca superior nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `UPDATE apoiadores SET
       supervisor_id=$3, nome=COALESCE($4,nome), cpf=COALESCE($5,cpf),
       telefone=COALESCE($6,telefone), whatsapp=COALESCE($7,whatsapp), email=COALESCE($8,email),
       endereco=COALESCE($9,endereco), bairro=COALESCE($10,bairro), cidade=COALESCE($11,cidade),
       uf=COALESCE($12,uf), ra=COALESCE($13,ra),
       meta_cadastros=COALESCE($14,meta_cadastros), meta_votos=COALESCE($15,meta_votos),
       votos_estimados=COALESCE($16,votos_estimados), lider_politico=COALESCE($17,lider_politico),
       nivel_influencia=COALESCE($18,nivel_influencia), status=COALESCE($19,status),
       observacoes=COALESCE($20,observacoes)
       WHERE id=$1 AND campanha_id=$2 RETURNING *`,
      [
        req.params.id, req.usuario.campanha_id, dados.supervisor_id, dados.nome,
        dados.cpf, dados.telefone, dados.whatsapp, dados.email, dados.endereco,
        dados.bairro, dados.cidade, dados.uf, dados.ra,
        req.body.meta_cadastros === undefined ? null : dados.meta_cadastros,
        req.body.meta_votos === undefined ? null : dados.meta_votos,
        req.body.votos_estimados === undefined ? null : dados.votos_estimados,
        req.body.lider_politico === undefined ? null : dados.lider_politico,
        req.body.nivel_influencia === undefined ? null : dados.nivel_influencia,
        req.body.status === undefined ? null : dados.status,
        dados.observacoes,
      ]
    );
    if (!resultado.rows[0]) return res.status(404).json({ erro: 'Apoiador nao encontrado.' });
    return res.json({ mensagem: 'Apoiador atualizado.', apoiador: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function historico(req, res, next) {
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const resultado = await query(
      `SELECT h.*, u.nome AS usuario_nome
       FROM historico_apoiadores h
       JOIN apoiadores a ON a.id = h.apoiador_id
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.apoiador_id = $1 AND a.campanha_id = $2
       ORDER BY h.created_at DESC`,
      [req.params.id, req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function adicionarHistorico(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem registrar historico.' });
    }
    const texto = limparTexto(req.body.descricao, 2000);
    if (!texto) return res.status(400).json({ erro: 'Descricao e obrigatoria.' });
    const existe = await query('SELECT id FROM apoiadores WHERE id=$1 AND campanha_id=$2', [req.params.id, req.usuario.campanha_id]);
    if (!existe.rows[0]) return res.status(404).json({ erro: 'Apoiador nao encontrado.' });
    const resultado = await query(
      `INSERT INTO historico_apoiadores (apoiador_id, usuario_id, tipo, descricao)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, req.usuario.id, limparTexto(req.body.tipo, 50) || 'anotacao', texto]
    );
    return res.status(201).json({ mensagem: 'Historico registrado.', historico: resultado.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listar, dashboard, criar, atualizar, historico, adicionarHistorico };
