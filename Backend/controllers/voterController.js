// voterController.js
// CRUD de eleitores - listagem, cadastro, edicao e exclusao
// CPF mascarado pra operadores por conta da LGPD

const { query, getClient } = require('../config/db');
const { ehCaboEleitoral, temAcessoAmplo } = require('../middlewares/authMiddleware');
const { registrar, ACOES } = require('../utils/auditoria');
const {
  limparTexto, normalizarCpf, normalizarEmail, emailValido,
  normalizarUf, ufValida, uuidValido,
} = require('../utils/validacao');

const STATUS_VOTO_VALIDOS = [
  'nao_identificado', 'indeciso', 'provavel', 'confirmado', 'oposicao', 'abstencao',
];

// lista de campos que quero trazer - evita SELECT * por seguranca
const CAMPOS_ELEITOR = `
  e.id,
  e.campanha_id,
  e.apoiador_id,
  e.cadastrado_por,
  e.nome,
  e.cpf,
  e.titulo_eleitor,
  e.data_nascimento,
  e.telefone,
  e.whatsapp,
  e.email,
  e.endereco,
  e.bairro,
  e.cidade,
  e.uf,
  e.cep,
  e.zona_eleitoral,
  e.secao_eleitoral,
  e.status_voto,
  e.observacoes,
  e.created_at,
  e.updated_at
`;

// esconde parte do CPF pra quem nao precisa ver completo
function mascararCpf(cpf) {
  if (!cpf) return null;
  const digitos = String(cpf).replace(/\D/g, '');
  if (digitos.length !== 11) return '***.***.***-**';
  return digitos.slice(0, 3) + '.***.***-' + digitos.slice(-2);
}

// aplica mascara conforme o nivel do usuario
function aplicarMascaramento(usuario, eleitor) {
  const copia = Object.assign({}, eleitor);
  if (usuario.nivel === 'operador' || usuario.nivel === 'visualizador') {
    copia.cpf = mascararCpf(copia.cpf);
    if (copia.titulo_eleitor) {
      copia.titulo_eleitor = copia.titulo_eleitor.slice(0, 4) + '****';
    }
  }
  return copia;
}

function montarDadosEleitor(body) {
  const email = normalizarEmail(body.email);
  const uf = normalizarUf(body.uf);

  return {
    nome: limparTexto(body.nome),
    cpf: normalizarCpf(body.cpf),
    titulo_eleitor: limparTexto(body.titulo_eleitor, 20),
    data_nascimento: limparTexto(body.data_nascimento, 10),
    telefone: limparTexto(body.telefone, 20),
    whatsapp: limparTexto(body.whatsapp, 20),
    email,
    endereco: limparTexto(body.endereco),
    bairro: limparTexto(body.bairro, 150),
    cidade: limparTexto(body.cidade, 150),
    uf,
    cep: limparTexto(body.cep, 10),
    zona_eleitoral: body.zona_eleitoral || null,
    secao_eleitoral: body.secao_eleitoral || null,
    status_voto: body.status_voto || null,
    observacoes: limparTexto(body.observacoes, 1000),
  };
}

function validarDadosEleitor(dados) {
  if (!dados.nome) return 'O campo nome e obrigatorio.';
  if (dados.email && !emailValido(dados.email)) return 'E-mail invalido.';
  if (dados.uf && !ufValida(dados.uf)) return 'UF deve ter 2 letras.';
  return null;
}

function validarDadosParciaisEleitor(dados) {
  if (dados.email && !emailValido(dados.email)) return 'E-mail invalido.';
  if (dados.uf && !ufValida(dados.uf)) return 'UF deve ter 2 letras.';
  return null;
}

// pega o id do apoiador vinculado ao cabo eleitoral logado
async function obterApoiadorIdDoUsuario(usuarioId) {
  const resultado = await query(
    `SELECT id FROM apoiadores WHERE usuario_id = $1 AND ativo = true LIMIT 1`,
    [usuarioId]
  );
  return resultado.rows[0]?.id || null;
}

async function apoiadorPertenceCampanha(apoiadorId, campanhaId) {
  if (!apoiadorId) return true;
  if (!uuidValido(apoiadorId)) return false;
  const resultado = await query(
    'SELECT id FROM apoiadores WHERE id = $1 AND campanha_id = $2',
    [apoiadorId, campanhaId]
  );
  return resultado.rows.length > 0;
}

// monta o WHERE dinamico com os filtros + isolamento de campanha
function montarCondicoesConsulta(usuario, filtros) {
  const condicoes = [];
  const parametros = [];
  let indice = 1;

  // sempre filtra pela campanha primeiro (multi-tenant)
  condicoes.push(`e.campanha_id = $${indice}`);
  parametros.push(usuario.campanha_id);
  indice += 1;

  // cabo eleitoral so ve os eleitores dele
  if (ehCaboEleitoral(usuario)) {
    condicoes.push(`(
      e.cadastrado_por = $${indice}
      OR e.apoiador_id IN (
        SELECT id FROM apoiadores WHERE usuario_id = $${indice}
      )
    )`);
    parametros.push(usuario.id);
    indice += 1;
  }

  if (filtros.bairro) {
    condicoes.push(`e.bairro ILIKE $${indice}`);
    parametros.push('%' + filtros.bairro + '%');
    indice += 1;
  }

  if (filtros.secao) {
    condicoes.push(`e.secao_eleitoral = $${indice}`);
    parametros.push(parseInt(filtros.secao, 10));
    indice += 1;
  }

  if (filtros.status_voto) {
    condicoes.push(`e.status_voto = $${indice}::status_voto`);
    parametros.push(filtros.status_voto);
    indice += 1;
  }

  const clausulaWhere = condicoes.length > 0 ? 'WHERE ' + condicoes.join(' AND ') : '';
  return { clausulaWhere, parametros, indice };
}

// verifica se o usuario tem acesso ao eleitor pelo id
async function verificarAcessoEleitor(usuario, eleitorId) {
  const { clausulaWhere, parametros } = montarCondicoesConsulta(usuario, {});
  const separador = clausulaWhere ? 'AND' : 'WHERE';

  const sql = `
    SELECT ${CAMPOS_ELEITOR}
    FROM eleitores e
    ${clausulaWhere}
    ${separador} e.id = $${parametros.length + 1}
  `;

  const resultado = await query(sql, parametros.concat([eleitorId]));
  return resultado.rows[0] || null;
}

// atualiza os contadores do apoiador quando cria/edita/exclui eleitor
async function atualizarContadoresApoiador(apoiadorId, deltaCadastros, deltaVotos) {
  if (!apoiadorId) return;
  await query(
    `UPDATE apoiadores
     SET cadastros_realizados = GREATEST(0, cadastros_realizados + $2),
         votos_confirmados    = GREATEST(0, votos_confirmados + $3),
         updated_at           = NOW()
     WHERE id = $1`,
    [apoiadorId, deltaCadastros, deltaVotos]
  );
}

// GET /api/voters - lista eleitores com paginacao e filtros
async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (pagina - 1) * limite;

    const filtros = {
      bairro: req.query.bairro || null,
      secao: req.query.secao || null,
      status_voto: req.query.status_voto || null,
    };

    if (filtros.status_voto && !STATUS_VOTO_VALIDOS.includes(filtros.status_voto)) {
      return res.status(400).json({
        erro: 'Status de voto invalido.',
        status_validos: STATUS_VOTO_VALIDOS,
      });
    }

    const { clausulaWhere, parametros, indice } = montarCondicoesConsulta(req.usuario, filtros);

    const resultadoCount = await query(
      'SELECT COUNT(*) AS total FROM eleitores e ' + clausulaWhere,
      parametros
    );
    const total = parseInt(resultadoCount.rows[0].total, 10);

    const resultadoLista = await query(
      `SELECT ${CAMPOS_ELEITOR}, a.nome AS apoiador_nome
       FROM eleitores e
       LEFT JOIN apoiadores a ON e.apoiador_id = a.id
       ${clausulaWhere}
       ORDER BY e.created_at DESC
       LIMIT $${indice} OFFSET $${indice + 1}`,
      parametros.concat([limite, offset])
    );

    const dadosMascarados = resultadoLista.rows.map(function(e) {
      return aplicarMascaramento(req.usuario, e);
    });

    return res.status(200).json({
      dados: dadosMascarados,
      paginacao: {
        pagina,
        limite,
        total,
        total_paginas: Math.ceil(total / limite),
      },
      filtros_aplicados: filtros,
      escopo: ehCaboEleitoral(req.usuario) ? 'proprios' : 'campanha',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/voters/:id - busca um eleitor pelo id
async function buscarPorId(req, res, next) {
  try {
    const eleitor = await verificarAcessoEleitor(req.usuario, req.params.id);
    if (!eleitor) {
      return res.status(404).json({ erro: 'Eleitor nao encontrado ou acesso negado.' });
    }
    const dados = temAcessoAmplo(req.usuario) ? eleitor : aplicarMascaramento(req.usuario, eleitor);
    return res.status(200).json({ eleitor: dados });
  } catch (err) {
    next(err);
  }
}

// POST /api/voters - cadastra um novo eleitor
async function criar(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem cadastrar eleitores.' });
    }

    const dados = montarDadosEleitor(req.body);
    const erroValidacao = validarDadosEleitor(dados);
    if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

    const statusFinal = dados.status_voto || 'nao_identificado';
    if (!STATUS_VOTO_VALIDOS.includes(statusFinal)) {
      return res.status(400).json({ erro: 'Status de voto invalido.', status_validos: STATUS_VOTO_VALIDOS });
    }

    const campanhaId = req.usuario.campanha_id;
    const cadastradoPor = req.usuario.id;

    let apoiadorId = req.body.apoiador_id || null;
    if (ehCaboEleitoral(req.usuario)) {
      apoiadorId = await obterApoiadorIdDoUsuario(req.usuario.id);
    }

    if (!(await apoiadorPertenceCampanha(apoiadorId, campanhaId))) {
      return res.status(403).json({ erro: 'Apoiador nao pertence a esta campanha.' });
    }

    const resultado = await query(
      `INSERT INTO eleitores (
         campanha_id, apoiador_id, cadastrado_por, nome, cpf, titulo_eleitor,
         data_nascimento, telefone, whatsapp, email, endereco, bairro, cidade,
         uf, cep, zona_eleitoral, secao_eleitoral, status_voto, observacoes
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
       ) RETURNING *`,
      [
        campanhaId, apoiadorId, cadastradoPor,
        dados.nome, dados.cpf, dados.titulo_eleitor,
        dados.data_nascimento, dados.telefone, dados.whatsapp,
        dados.email, dados.endereco, dados.bairro, dados.cidade,
        dados.uf, dados.cep, dados.zona_eleitoral, dados.secao_eleitoral,
        statusFinal, dados.observacoes,
      ]
    );

    const eleitorCriado = resultado.rows[0];

    await atualizarContadoresApoiador(apoiadorId, 1, 0);
    if (statusFinal === 'confirmado') {
      await atualizarContadoresApoiador(apoiadorId, 0, 1);
    }

    await registrar({
      campanha_id: campanhaId,
      usuario_id: req.usuario.id,
      acao: ACOES.ELEITOR_CRIADO,
      entidade: 'eleitor',
      entidade_id: eleitorCriado.id,
      ip: req.ip,
      antes: null,
      depois: { nome: eleitorCriado.nome, status_voto: eleitorCriado.status_voto },
    });

    return res.status(201).json({
      mensagem: 'Eleitor cadastrado com sucesso.',
      eleitor: aplicarMascaramento(req.usuario, eleitorCriado),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'CPF ja cadastrado no sistema.' });
    }
    next(err);
  }
}

// PUT /api/voters/:id - atualiza um eleitor
async function atualizar(req, res, next) {
  let client;
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem editar eleitores.' });
    }

    const { id } = req.params;
    const eleitorExistente = await verificarAcessoEleitor(req.usuario, id);
    if (!eleitorExistente) {
      return res.status(404).json({ erro: 'Eleitor nao encontrado ou acesso negado.' });
    }

    const dados = montarDadosEleitor(req.body);
    const erroValidacao = validarDadosParciaisEleitor(dados);
    if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

    if (dados.status_voto && !STATUS_VOTO_VALIDOS.includes(dados.status_voto)) {
      return res.status(400).json({ erro: 'Status de voto invalido.', status_validos: STATUS_VOTO_VALIDOS });
    }

    let apoiadorId = eleitorExistente.apoiador_id;
    if (temAcessoAmplo(req.usuario) && req.body.apoiador_id !== undefined) {
      apoiadorId = req.body.apoiador_id;
    }

    if (!(await apoiadorPertenceCampanha(apoiadorId, req.usuario.campanha_id))) {
      return res.status(403).json({ erro: 'Apoiador nao pertence a esta campanha.' });
    }

    client = await getClient();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.usuario_id', $1, true)", [req.usuario.id]);
    const resultado = await client.query(
      `UPDATE eleitores SET
         nome             = COALESCE($2, nome),
         cpf              = COALESCE($3, cpf),
         titulo_eleitor   = COALESCE($4, titulo_eleitor),
         data_nascimento  = COALESCE($5, data_nascimento),
         telefone         = COALESCE($6, telefone),
         whatsapp         = COALESCE($7, whatsapp),
         email            = COALESCE($8, email),
         endereco         = COALESCE($9, endereco),
         bairro           = COALESCE($10, bairro),
         cidade           = COALESCE($11, cidade),
         uf               = COALESCE($12, uf),
         cep              = COALESCE($13, cep),
         zona_eleitoral   = COALESCE($14, zona_eleitoral),
         secao_eleitoral  = COALESCE($15, secao_eleitoral),
         status_voto      = COALESCE($16::status_voto, status_voto),
         observacoes      = COALESCE($17, observacoes),
         apoiador_id      = $18
       WHERE id = $1 AND campanha_id = $19
       RETURNING *`,
      [
        id, dados.nome, dados.cpf, dados.titulo_eleitor,
        dados.data_nascimento, dados.telefone, dados.whatsapp,
        dados.email, dados.endereco, dados.bairro, dados.cidade,
        dados.uf, dados.cep, dados.zona_eleitoral, dados.secao_eleitoral,
        dados.status_voto, dados.observacoes, apoiadorId,
        req.usuario.campanha_id,
      ]
    );

    await client.query('COMMIT');
    client.release();
    client = null;

    const eleitorAtualizado = resultado.rows[0];
    if (!eleitorAtualizado) {
      return res.status(404).json({ erro: 'Eleitor nao encontrado ou acesso negado.' });
    }

    const statusAnterior = eleitorExistente.status_voto;
    const statusNovo = eleitorAtualizado.status_voto;
    if (statusAnterior !== 'confirmado' && statusNovo === 'confirmado') {
      await atualizarContadoresApoiador(apoiadorId, 0, 1);
    }
    if (statusAnterior === 'confirmado' && statusNovo !== 'confirmado') {
      await atualizarContadoresApoiador(apoiadorId, 0, -1);
    }

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.ELEITOR_ATUALIZADO,
      entidade: 'eleitor',
      entidade_id: id,
      ip: req.ip,
      antes: { status_voto: statusAnterior },
      depois: { status_voto: statusNovo },
    });

    return res.status(200).json({
      mensagem: 'Eleitor atualizado com sucesso.',
      eleitor: aplicarMascaramento(req.usuario, eleitorAtualizado),
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(function() {});
      client.release();
    }
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'CPF ja cadastrado no sistema.' });
    }
    next(err);
  }
}

// DELETE /api/voters/:id - remove eleitor
async function excluir(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem excluir eleitores.' });
    }

    const { id } = req.params;
    const eleitorExistente = await verificarAcessoEleitor(req.usuario, id);
    if (!eleitorExistente) {
      return res.status(404).json({ erro: 'Eleitor nao encontrado ou acesso negado.' });
    }

    if (ehCaboEleitoral(req.usuario)) {
      return res.status(403).json({
        erro: 'Cabo Eleitoral nao tem permissao para excluir eleitores. Contate o coordenador.',
      });
    }

    const exclusao = await query(
      'DELETE FROM eleitores WHERE id = $1 AND campanha_id = $2',
      [id, req.usuario.campanha_id]
    );
    if (exclusao.rowCount === 0) {
      return res.status(404).json({ erro: 'Eleitor nao encontrado ou acesso negado.' });
    }

    await atualizarContadoresApoiador(eleitorExistente.apoiador_id, -1, 0);
    if (eleitorExistente.status_voto === 'confirmado') {
      await atualizarContadoresApoiador(eleitorExistente.apoiador_id, 0, -1);
    }

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.ELEITOR_EXCLUIDO,
      entidade: 'eleitor',
      entidade_id: id,
      ip: req.ip,
      antes: { nome: eleitorExistente.nome, status_voto: eleitorExistente.status_voto },
      depois: null,
    });

    return res.status(200).json({ mensagem: 'Eleitor excluido com sucesso.', id });
  } catch (err) {
    next(err);
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, excluir };
