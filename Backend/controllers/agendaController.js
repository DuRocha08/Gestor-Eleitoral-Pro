const { query } = require('../config/db');
const { limparTexto, uuidValido } = require('../utils/validacao');
const { registrar } = require('../utils/auditoria');

const TIPOS = ['reuniao', 'visita', 'evento', 'lembrete'];
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];
const STATUS = ['agendado', 'confirmado', 'realizado', 'cancelado'];

function dataValida(valor) {
  if (!valor) return false;
  const data = new Date(valor);
  return !Number.isNaN(data.getTime());
}

function montarDados(body) {
  return {
    titulo: limparTexto(body.titulo),
    descricao: limparTexto(body.descricao, 2000),
    tipo: body.tipo || 'evento',
    prioridade: body.prioridade || 'media',
    status: body.status || 'agendado',
    data_inicio: body.data_inicio,
    data_fim: body.data_fim || null,
    local: limparTexto(body.local),
    bairro: limparTexto(body.bairro, 150),
    cidade: limparTexto(body.cidade, 150),
    lembrete_em: body.lembrete_em || null,
    observacoes: limparTexto(body.observacoes, 2000),
    responsavel_id: body.responsavel_id || null,
  };
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
    const condicoes = ['a.campanha_id = $1'];
    const params = [req.usuario.campanha_id];
    let i = 2;

    ['tipo', 'status', 'prioridade'].forEach(function(campo) {
      if (req.query[campo]) {
        condicoes.push(`a.${campo} = $${i}`);
        params.push(req.query[campo]);
        i += 1;
      }
    });

    if (req.query.busca) {
      condicoes.push(`(a.titulo ILIKE $${i} OR a.bairro ILIKE $${i} OR a.cidade ILIKE $${i})`);
      params.push('%' + req.query.busca + '%');
      i += 1;
    }

    if (req.query.inicio) {
      condicoes.push(`a.data_inicio >= $${i}`);
      params.push(req.query.inicio);
      i += 1;
    }

    if (req.query.fim) {
      condicoes.push(`a.data_inicio <= $${i}`);
      params.push(req.query.fim);
      i += 1;
    }

    const resultado = await query(
      `SELECT a.*, u.nome AS responsavel_nome
       FROM agenda_compromissos a
       LEFT JOIN usuarios u ON u.id = a.responsavel_id
       WHERE ${condicoes.join(' AND ')}
       ORDER BY a.data_inicio ASC
       LIMIT 200`,
      params
    );

    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function criar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem criar agenda.' });
    }

    const dados = montarDados(req.body);
    if (!dados.titulo) return res.status(400).json({ erro: 'Titulo e obrigatorio.' });
    if (!dataValida(dados.data_inicio)) return res.status(400).json({ erro: 'Data de inicio invalida.' });
    if (dados.data_fim && !dataValida(dados.data_fim)) return res.status(400).json({ erro: 'Data final invalida.' });
    if (!TIPOS.includes(dados.tipo)) return res.status(400).json({ erro: 'Tipo invalido.', tipos_validos: TIPOS });
    if (!PRIORIDADES.includes(dados.prioridade)) return res.status(400).json({ erro: 'Prioridade invalida.', prioridades_validas: PRIORIDADES });
    if (!STATUS.includes(dados.status)) return res.status(400).json({ erro: 'Status invalido.', status_validos: STATUS });
    if (!(await responsavelValido(req.usuario.campanha_id, dados.responsavel_id))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO agenda_compromissos
       (campanha_id, criado_por, responsavel_id, titulo, descricao, tipo, prioridade, status,
        data_inicio, data_fim, local, bairro, cidade, lembrete_em, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        req.usuario.campanha_id, req.usuario.id, dados.responsavel_id, dados.titulo,
        dados.descricao, dados.tipo, dados.prioridade, dados.status, dados.data_inicio,
        dados.data_fim, dados.local, dados.bairro, dados.cidade, dados.lembrete_em,
        dados.observacoes,
      ]
    );

    await registrar({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: 'agenda_criada', entidade: 'agenda', entidade_id: resultado.rows[0].id,
      ip: req.ip, antes: null, depois: { titulo: resultado.rows[0].titulo },
    });

    return res.status(201).json({ mensagem: 'Compromisso salvo.', compromisso: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function atualizar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem editar agenda.' });
    }
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });

    const dados = montarDados(req.body);
    if (dados.tipo && !TIPOS.includes(dados.tipo)) return res.status(400).json({ erro: 'Tipo invalido.' });
    if (dados.prioridade && !PRIORIDADES.includes(dados.prioridade)) return res.status(400).json({ erro: 'Prioridade invalida.' });
    if (dados.status && !STATUS.includes(dados.status)) return res.status(400).json({ erro: 'Status invalido.' });
    if (dados.data_inicio && !dataValida(dados.data_inicio)) return res.status(400).json({ erro: 'Data de inicio invalida.' });
    if (!(await responsavelValido(req.usuario.campanha_id, dados.responsavel_id))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `UPDATE agenda_compromissos SET
       responsavel_id=COALESCE($3,responsavel_id), titulo=COALESCE($4,titulo),
       descricao=COALESCE($5,descricao), tipo=COALESCE($6,tipo),
       prioridade=COALESCE($7,prioridade), status=COALESCE($8,status),
       data_inicio=COALESCE($9,data_inicio), data_fim=COALESCE($10,data_fim),
       local=COALESCE($11,local), bairro=COALESCE($12,bairro), cidade=COALESCE($13,cidade),
       lembrete_em=COALESCE($14,lembrete_em), observacoes=COALESCE($15,observacoes)
       WHERE id=$1 AND campanha_id=$2 RETURNING *`,
      [
        req.params.id, req.usuario.campanha_id, dados.responsavel_id, dados.titulo,
        dados.descricao, req.body.tipo || null, req.body.prioridade || null,
        req.body.status || null, dados.data_inicio || null, dados.data_fim, dados.local,
        dados.bairro, dados.cidade, dados.lembrete_em, dados.observacoes,
      ]
    );

    if (!resultado.rows[0]) return res.status(404).json({ erro: 'Compromisso nao encontrado.' });
    return res.json({ mensagem: 'Compromisso atualizado.', compromisso: resultado.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { listar, criar, atualizar };
