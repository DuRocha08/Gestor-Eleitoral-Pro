const { query } = require('../config/db');
const { limparTexto, uuidValido } = require('../utils/validacao');

const STATUS = ['pendente', 'em_andamento', 'concluida', 'atrasada', 'cancelada'];

function dataValida(valor) {
  return !valor || /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

async function responsavelValido(campanhaId, usuarioId) {
  if (!usuarioId) return true;
  if (!uuidValido(usuarioId)) return false;
  const resultado = await query(
    'SELECT id FROM usuarios WHERE id = $1 AND campanha_id = $2 AND ativo = true',
    [usuarioId, campanhaId]
  );
  return resultado.rowCount > 0;
}

async function listar(req, res, next) {
  try {
    const resultado = await query(
      `SELECT a.*, u.nome AS responsavel_usuario
       FROM plano_campanha_acoes a
       LEFT JOIN usuarios u ON u.id = a.responsavel_id
       WHERE a.campanha_id=$1
       ORDER BY a.data_prazo NULLS LAST, a.created_at DESC`,
      [req.usuario.campanha_id]
    );
    const resumo = await query(
      `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status='concluida')::int AS concluidas,
        ROUND(AVG(progresso),0)::int AS progresso_medio
       FROM plano_campanha_acoes WHERE campanha_id=$1`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows, resumo: resumo.rows[0] });
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem criar acoes.' });
    }
    const titulo = limparTexto(req.body.titulo);
    const status = req.body.status || 'pendente';
    const progresso = Number(req.body.progresso || 0);
    const responsavelId = req.body.responsavel_id || null;
    const dataInicio = limparTexto(req.body.data_inicio, 10);
    const dataPrazo = limparTexto(req.body.data_prazo, 10);
    if (!titulo) return res.status(400).json({ erro: 'Titulo e obrigatorio.' });
    if (!STATUS.includes(status)) return res.status(400).json({ erro: 'Status invalido.' });
    if (!Number.isFinite(progresso) || progresso < 0 || progresso > 100) return res.status(400).json({ erro: 'Progresso invalido.' });
    if (!dataValida(dataInicio) || !dataValida(dataPrazo)) return res.status(400).json({ erro: 'Data invalida.' });
    if (!(await responsavelValido(req.usuario.campanha_id, responsavelId))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO plano_campanha_acoes
       (campanha_id, criado_por, fase, titulo, descricao, responsavel_id, responsavel_nome,
        data_inicio, data_prazo, status, progresso, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        req.usuario.campanha_id, req.usuario.id, limparTexto(req.body.fase, 100),
        titulo, limparTexto(req.body.descricao, 2000), responsavelId,
        limparTexto(req.body.responsavel_nome), dataInicio,
        dataPrazo, status, progresso,
        limparTexto(req.body.observacoes, 2000),
      ]
    );
    return res.status(201).json({ mensagem: 'Acao salva.', acao: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem editar acoes.' });
    }
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const status = req.body.status || null;
    const progresso = req.body.progresso === undefined ? null : Number(req.body.progresso);
    const responsavelId = req.body.responsavel_id === undefined ? null : req.body.responsavel_id || null;
    const dataInicio = limparTexto(req.body.data_inicio, 10);
    const dataPrazo = limparTexto(req.body.data_prazo, 10);
    if (status && !STATUS.includes(status)) return res.status(400).json({ erro: 'Status invalido.' });
    if (progresso !== null && (!Number.isFinite(progresso) || progresso < 0 || progresso > 100)) return res.status(400).json({ erro: 'Progresso invalido.' });
    if (!dataValida(dataInicio) || !dataValida(dataPrazo)) return res.status(400).json({ erro: 'Data invalida.' });
    if (req.body.responsavel_id !== undefined && !(await responsavelValido(req.usuario.campanha_id, responsavelId))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `UPDATE plano_campanha_acoes SET
       fase=COALESCE($3,fase), titulo=COALESCE($4,titulo), descricao=COALESCE($5,descricao),
       responsavel_id=COALESCE($6,responsavel_id), responsavel_nome=COALESCE($7,responsavel_nome),
       data_inicio=COALESCE($8,data_inicio), data_prazo=COALESCE($9,data_prazo),
       status=COALESCE($10,status), progresso=COALESCE($11,progresso),
       observacoes=COALESCE($12,observacoes)
       WHERE id=$1 AND campanha_id=$2 RETURNING *`,
      [
        req.params.id, req.usuario.campanha_id, limparTexto(req.body.fase, 100),
        limparTexto(req.body.titulo), limparTexto(req.body.descricao, 2000),
        responsavelId, limparTexto(req.body.responsavel_nome), dataInicio,
        dataPrazo, status, progresso,
        limparTexto(req.body.observacoes, 2000),
      ]
    );
    if (!resultado.rows[0]) return res.status(404).json({ erro: 'Acao nao encontrada.' });
    return res.json({ mensagem: 'Acao atualizada.', acao: resultado.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listar, criar, atualizar };
