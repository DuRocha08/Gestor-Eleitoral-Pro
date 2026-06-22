// demandController.js - ouvidoria da campanha/gabinete
const { query } = require('../config/db');
const { ehCaboEleitoral, temAcessoAmplo } = require('../middlewares/authMiddleware');
const { limparTexto, uuidValido } = require('../utils/validacao');
const { registrar, ACOES } = require('../utils/auditoria');

const PRIORIDADES_VALIDAS = ['baixa', 'media', 'alta', 'urgente'];
const STATUS_VALIDOS = ['aberta', 'em_analise', 'em_andamento', 'resolvida', 'cancelada'];

function dataIsoValida(valor) {
  if (!valor) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(valor + 'T00:00:00Z');
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function camposTextoDemandaValidos(body) {
  const limites = {
    titulo: 255,
    descricao: 2000,
    categoria: 100,
    bairro: 150,
    endereco_referencia: 255,
    data_prazo: 10,
    anotacoes_internas: 2000,
  };
  return Object.entries(limites).every(function([campo, limite]) {
    const valor = body[campo];
    return valor === undefined || valor === null ||
      (typeof valor === 'string' && valor.trim().length <= limite);
  });
}

// campos que quero trazer - sem SELECT *
const CAMPOS_DEMANDA = `
  d.id,
  d.campanha_id,
  d.eleitor_id,
  d.responsavel_id,
  d.titulo,
  d.descricao,
  d.categoria,
  d.prioridade,
  d.status,
  d.bairro,
  d.endereco_referencia,
  d.data_prazo,
  d.data_resolucao,
  d.anotacoes_internas,
  d.created_at,
  d.updated_at
`;

// monta WHERE dinamico com filtros + isolamento por campanha
function montarCondicoesDemanda(usuario, filtros) {
  const condicoes = [];
  const parametros = [];
  let indice = 1;

  condicoes.push(`d.campanha_id = $${indice}`);
  parametros.push(usuario.campanha_id);
  indice += 1;

  // cabo eleitoral so ve o que e dele
  if (ehCaboEleitoral(usuario)) {
    condicoes.push(`(
      d.responsavel_id = $${indice}
      OR d.eleitor_id IN (
        SELECT e.id FROM eleitores e
        WHERE e.cadastrado_por = $${indice}
           OR e.apoiador_id IN (
             SELECT id FROM apoiadores WHERE usuario_id = $${indice}
           )
      )
    )`);
    parametros.push(usuario.id);
    indice += 1;
  }

  if (filtros.status) {
    condicoes.push(`d.status = $${indice}::status_demanda`);
    parametros.push(filtros.status);
    indice += 1;
  }

  if (filtros.prioridade) {
    condicoes.push(`d.prioridade = $${indice}::prioridade_demanda`);
    parametros.push(filtros.prioridade);
    indice += 1;
  }

  if (filtros.bairro) {
    condicoes.push(`d.bairro ILIKE $${indice}`);
    parametros.push(`%${filtros.bairro}%`);
    indice += 1;
  }

  const clausulaWhere = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';
  return { clausulaWhere, parametros, indice };
}

// verifica se o usuario pode acessar a demanda pelo id
async function verificarAcessoDemanda(usuario, demandaId) {
  const { clausulaWhere, parametros } = montarCondicoesDemanda(usuario, {});

  const sql = `
    SELECT ${CAMPOS_DEMANDA},
           el.nome AS eleitor_nome,
           u.nome  AS responsavel_nome
    FROM demandas_comunidade d
    LEFT JOIN eleitores el ON d.eleitor_id = el.id
    LEFT JOIN usuarios u   ON d.responsavel_id = u.id
    ${clausulaWhere}
    ${clausulaWhere ? 'AND' : 'WHERE'} d.id = $${parametros.length + 1}
  `;

  const resultado = await query(sql, [...parametros, demandaId]);
  return resultado.rows[0] || null;
}

// checa se o eleitor existe e pertence ao escopo do usuario
async function validarEleitorVinculado(usuario, eleitorId) {
  if (!eleitorId) return true;
  if (!uuidValido(eleitorId)) return false;

  const condicoes = ['e.id = $1'];
  const parametros = [eleitorId];
  let indice = 2;

  condicoes.push(`e.campanha_id = $${indice}`);
  parametros.push(usuario.campanha_id);
  indice += 1;

  if (ehCaboEleitoral(usuario)) {
    condicoes.push(`(
      e.cadastrado_por = $${indice}
      OR e.apoiador_id IN (
        SELECT id FROM apoiadores WHERE usuario_id = $${indice}
      )
    )`);
    parametros.push(usuario.id);
  }

  const resultado = await query(
    `SELECT id FROM eleitores e WHERE ${condicoes.join(' AND ')}`,
    parametros
  );

  return resultado.rows.length > 0;
}

async function validarResponsavel(campanhaId, usuarioId) {
  if (!usuarioId) return true;
  if (!uuidValido(usuarioId)) return false;
  const resultado = await query(
    'SELECT id FROM usuarios WHERE id = $1 AND campanha_id = $2 AND ativo = true',
    [usuarioId, campanhaId]
  );
  return resultado.rows.length > 0;
}

// GET /api/demands - lista demandas com paginacao e filtros
async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (pagina - 1) * limite;

    const filtros = {
      status: req.query.status || null,
      prioridade: req.query.prioridade || null,
      bairro: req.query.bairro || null,
    };

    if (filtros.status && !STATUS_VALIDOS.includes(filtros.status)) {
      return res.status(400).json({ erro: 'Status invalido.', status_validos: STATUS_VALIDOS });
    }

    if (filtros.prioridade && !PRIORIDADES_VALIDAS.includes(filtros.prioridade)) {
      return res.status(400).json({ erro: 'Prioridade invalida.', prioridades_validas: PRIORIDADES_VALIDAS });
    }

    const { clausulaWhere, parametros, indice } = montarCondicoesDemanda(req.usuario, filtros);

    const resultadoCount = await query(
      `SELECT COUNT(*) AS total FROM demandas_comunidade d ${clausulaWhere}`,
      parametros
    );

    const total = parseInt(resultadoCount.rows[0].total, 10);

    // ordena urgentes primeiro, depois por data
    const resultadoLista = await query(
      `SELECT ${CAMPOS_DEMANDA},
              el.nome AS eleitor_nome,
              u.nome  AS responsavel_nome
       FROM demandas_comunidade d
       LEFT JOIN eleitores el ON d.eleitor_id = el.id
       LEFT JOIN usuarios u   ON d.responsavel_id = u.id
       ${clausulaWhere}
       ORDER BY
         CASE d.prioridade
           WHEN 'urgente' THEN 1
           WHEN 'alta'     THEN 2
           WHEN 'media'    THEN 3
           WHEN 'baixa'    THEN 4
         END,
         d.created_at DESC
       LIMIT $${indice} OFFSET $${indice + 1}`,
      [...parametros, limite, offset]
    );

    return res.status(200).json({
      dados: resultadoLista.rows,
      paginacao: { pagina, limite, total, total_paginas: Math.ceil(total / limite) },
      filtros_aplicados: filtros,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/demands/:id - busca uma demanda pelo id
async function buscarPorId(req, res, next) {
  try {
    const demanda = await verificarAcessoDemanda(req.usuario, req.params.id);

    if (!demanda) {
      return res.status(404).json({ erro: 'Demanda nao encontrada ou acesso negado.' });
    }

    return res.status(200).json({ demanda });
  } catch (err) {
    next(err);
  }
}

// POST /api/demands - cria nova demanda
async function criar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem criar demandas.' });
    }

    if (!camposTextoDemandaValidos(req.body)) {
      return res.status(400).json({ erro: 'Um ou mais campos de texto possuem formato ou tamanho invalido.' });
    }

    const {
      eleitor_id, titulo, descricao, categoria, prioridade,
      bairro, endereco_referencia, data_prazo, anotacoes_internas,
    } = req.body;

    const dados = {
      titulo: limparTexto(titulo),
      descricao: limparTexto(descricao, 2000),
      categoria: limparTexto(categoria, 100),
      bairro: limparTexto(bairro, 150),
      endereco_referencia: limparTexto(endereco_referencia),
      data_prazo: limparTexto(data_prazo, 10),
      anotacoes_internas: limparTexto(anotacoes_internas, 2000),
    };

    if (!dados.titulo || !dados.descricao) {
      return res.status(400).json({ erro: 'Titulo e descricao sao obrigatorios.' });
    }

    if (!dataIsoValida(dados.data_prazo)) {
      return res.status(400).json({ erro: 'Data de prazo invalida.' });
    }

    const prioridadeFinal = prioridade || 'media';

    if (!PRIORIDADES_VALIDAS.includes(prioridadeFinal)) {
      return res.status(400).json({ erro: 'Prioridade invalida.', prioridades_validas: PRIORIDADES_VALIDAS });
    }

    const eleitorValido = await validarEleitorVinculado(req.usuario, eleitor_id);

    if (!eleitorValido) {
      return res.status(403).json({ erro: 'Eleitor nao encontrado ou sem permissao para vincular.' });
    }

    const campanhaId = req.usuario.campanha_id;
    const responsavelId = ehCaboEleitoral(req.usuario)
      ? req.usuario.id
      : (req.body.responsavel_id || null);

    if (!(await validarResponsavel(campanhaId, responsavelId))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO demandas_comunidade (
         campanha_id, eleitor_id, responsavel_id, titulo, descricao, categoria,
         prioridade, status, bairro, endereco_referencia, data_prazo, anotacoes_internas
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::prioridade_demanda, 'aberta'::status_demanda,
         $8, $9, $10, $11
       )
       RETURNING *`,
      [
        campanhaId, eleitor_id || null, responsavelId,
        dados.titulo, dados.descricao, dados.categoria,
        prioridadeFinal, dados.bairro, dados.endereco_referencia,
        dados.data_prazo, dados.anotacoes_internas,
      ]
    );

    await registrar({
      campanha_id: campanhaId,
      usuario_id: req.usuario.id,
      acao: ACOES.DEMANDA_CRIADA,
      entidade: 'demanda',
      entidade_id: resultado.rows[0].id,
      ip: req.ip,
      antes: null,
      depois: { status: resultado.rows[0].status, prioridade: resultado.rows[0].prioridade },
    });

    return res.status(201).json({
      mensagem: 'Demanda registrada com sucesso na ouvidoria.',
      demanda: resultado.rows[0],
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ erro: 'Referencia invalida (eleitor ou responsavel).' });
    }
    next(err);
  }
}

// PATCH /api/demands/:id/status - atualiza o status
async function atualizarStatus(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem alterar status.' });
    }

    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ erro: 'O campo status e obrigatorio.' });
    }

    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ erro: 'Status invalido.', status_validos: STATUS_VALIDOS });
    }

    const demandaExistente = await verificarAcessoDemanda(req.usuario, req.params.id);

    if (!demandaExistente) {
      return res.status(404).json({ erro: 'Demanda nao encontrada ou acesso negado.' });
    }

    if (ehCaboEleitoral(req.usuario) && demandaExistente.responsavel_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Cabo Eleitoral so pode alterar demandas atribuidas a ele.' });
    }

    const dataResolucao = status === 'resolvida' ? new Date() : null;

    const resultado = await query(
      `UPDATE demandas_comunidade SET
         status         = $2::status_demanda,
         data_resolucao = CASE
           WHEN $2::text = 'resolvida' THEN COALESCE($3::timestamptz, NOW())
           ELSE NULL
         END
       WHERE id = $1 AND campanha_id = $4
       RETURNING *`,
      [req.params.id, status, dataResolucao, req.usuario.campanha_id]
    );

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.DEMANDA_ATUALIZADA,
      entidade: 'demanda',
      entidade_id: req.params.id,
      ip: req.ip,
      antes: { status: demandaExistente.status },
      depois: { status: resultado.rows[0].status },
    });

    return res.status(200).json({
      mensagem: 'Status da demanda atualizado com sucesso.',
      demanda: resultado.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/demands/:id/priority - altera a prioridade
async function atualizarPrioridade(req, res, next) {
  try {
    if (!temAcessoAmplo(req.usuario)) {
      return res.status(403).json({
        erro: 'Apenas coordenador ou admin podem alterar a prioridade da demanda.',
      });
    }

    const { prioridade } = req.body;

    if (!prioridade) {
      return res.status(400).json({ erro: 'O campo prioridade e obrigatorio.' });
    }

    if (!PRIORIDADES_VALIDAS.includes(prioridade)) {
      return res.status(400).json({ erro: 'Prioridade invalida.', prioridades_validas: PRIORIDADES_VALIDAS });
    }

    const demandaExistente = await verificarAcessoDemanda(req.usuario, req.params.id);

    if (!demandaExistente) {
      return res.status(404).json({ erro: 'Demanda nao encontrada ou acesso negado.' });
    }

    const resultado = await query(
      `UPDATE demandas_comunidade SET prioridade = $2::prioridade_demanda
       WHERE id = $1 AND campanha_id = $3 RETURNING *`,
      [req.params.id, prioridade, req.usuario.campanha_id]
    );

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.DEMANDA_ATUALIZADA,
      entidade: 'demanda',
      entidade_id: req.params.id,
      ip: req.ip,
      antes: { prioridade: demandaExistente.prioridade },
      depois: { prioridade: resultado.rows[0].prioridade },
    });

    return res.status(200).json({
      mensagem: 'Prioridade da demanda atualizada com sucesso.',
      demanda: resultado.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/demands/:id - edicao geral da demanda
async function atualizar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem editar demandas.' });
    }

    if (!camposTextoDemandaValidos(req.body)) {
      return res.status(400).json({ erro: 'Um ou mais campos de texto possuem formato ou tamanho invalido.' });
    }

    const demandaExistente = await verificarAcessoDemanda(req.usuario, req.params.id);

    if (!demandaExistente) {
      return res.status(404).json({ erro: 'Demanda nao encontrada ou acesso negado.' });
    }

    if (ehCaboEleitoral(req.usuario) && demandaExistente.responsavel_id !== req.usuario.id) {
      return res.status(403).json({ erro: 'Cabo Eleitoral so pode editar demandas atribuidas a ele.' });
    }

    if (req.body.eleitor_id) {
      const eleitorValido = await validarEleitorVinculado(req.usuario, req.body.eleitor_id);
      if (!eleitorValido) {
        return res.status(403).json({ erro: 'Eleitor nao encontrado ou sem permissao.' });
      }
    }

    let responsavelId = demandaExistente.responsavel_id;
    if (temAcessoAmplo(req.usuario) && req.body.responsavel_id !== undefined) {
      responsavelId = req.body.responsavel_id;
    }

    if (!(await validarResponsavel(req.usuario.campanha_id, responsavelId))) {
      return res.status(403).json({ erro: 'Responsavel nao pertence a esta campanha.' });
    }

    const dados = {
      titulo: limparTexto(req.body.titulo),
      descricao: limparTexto(req.body.descricao, 2000),
      categoria: limparTexto(req.body.categoria, 100),
      bairro: limparTexto(req.body.bairro, 150),
      endereco_referencia: limparTexto(req.body.endereco_referencia),
      data_prazo: limparTexto(req.body.data_prazo, 10),
      anotacoes_internas: limparTexto(req.body.anotacoes_internas, 2000),
    };

    if (!dataIsoValida(dados.data_prazo)) {
      return res.status(400).json({ erro: 'Data de prazo invalida.' });
    }

    const resultado = await query(
      `UPDATE demandas_comunidade SET
         eleitor_id          = COALESCE($2, eleitor_id),
         responsavel_id      = $3,
         titulo              = COALESCE($4, titulo),
         descricao           = COALESCE($5, descricao),
         categoria           = COALESCE($6, categoria),
         bairro              = COALESCE($7, bairro),
         endereco_referencia = COALESCE($8, endereco_referencia),
         data_prazo          = COALESCE($9, data_prazo),
         anotacoes_internas  = COALESCE($10, anotacoes_internas)
       WHERE id = $1 AND campanha_id = $11
       RETURNING *`,
      [
        req.params.id,
        req.body.eleitor_id || null,
        responsavelId,
        dados.titulo,
        dados.descricao,
        dados.categoria,
        dados.bairro,
        dados.endereco_referencia,
        dados.data_prazo,
        dados.anotacoes_internas,
        req.usuario.campanha_id,
      ]
    );

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.DEMANDA_ATUALIZADA,
      entidade: 'demanda',
      entidade_id: req.params.id,
      ip: req.ip,
      antes: { status: demandaExistente.status, prioridade: demandaExistente.prioridade },
      depois: { status: resultado.rows[0].status, prioridade: resultado.rows[0].prioridade },
    });

    return res.status(200).json({
      mensagem: 'Demanda atualizada com sucesso.',
      demanda: resultado.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizarStatus,
  atualizarPrioridade,
  atualizar,
};
