const { query } = require('../config/db');
const { limparTexto, uuidValido } = require('../utils/validacao');

const TIPOS_PERGUNTA = ['unica', 'multipla', 'sim_nao', 'escala', 'numero', 'texto'];
const AVISO_LEGAL = 'Esta consulta popular nao possui registro oficial como pesquisa eleitoral e nao deve ser divulgada como pesquisa eleitoral registrada. Os resultados servem apenas para analise interna de aceitacao e percepcao popular.';

function perguntasValidas(perguntas) {
  if (!Array.isArray(perguntas)) return false;
  return perguntas.every(function(p) {
    return p && limparTexto(p.texto, 255) && TIPOS_PERGUNTA.includes(p.tipo);
  });
}

async function listarQuestionarios(req, res, next) {
  try {
    const resultado = await query(
      `SELECT id, titulo, descricao, perguntas, ativo, created_at, updated_at
       FROM pesquisa_questionarios
       WHERE campanha_id = $1
       ORDER BY ativo DESC, created_at DESC`,
      [req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

async function criarQuestionario(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem criar questionarios.' });
    }
    const titulo = limparTexto(req.body.titulo);
    const descricao = limparTexto(req.body.descricao, 2000);
    const cargo = limparTexto(req.body.cargo, 100);
    const perguntas = req.body.perguntas || [];
    if (!titulo) return res.status(400).json({ erro: 'Titulo e obrigatorio.' });
    if (!perguntasValidas(perguntas)) {
      return res.status(400).json({ erro: 'Perguntas invalidas.', tipos_validos: TIPOS_PERGUNTA });
    }

    const resultado = await query(
      `INSERT INTO pesquisa_questionarios (campanha_id, criado_por, titulo, descricao, cargo, perguntas, permite_anonimo)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.usuario.campanha_id, req.usuario.id, titulo, descricao, cargo,
        JSON.stringify(perguntas), req.body.permite_anonimo !== false,
      ]
    );
    return res.status(201).json({ mensagem: 'Questionario criado.', questionario: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function buscarQuestionarioPublico(req, res, next) {
  try {
    const resultado = await query(
      `SELECT id, titulo, descricao, slug, cargo, perguntas, permite_anonimo
       FROM pesquisa_questionarios
       WHERE slug=$1 AND ativo=true`,
      [req.params.slug]
    );
    if (!resultado.rows[0]) return res.status(404).json({ erro: 'Questionario nao encontrado.' });
    return res.json({ questionario: resultado.rows[0], aviso_legal: AVISO_LEGAL });
  } catch (err) { next(err); }
}

async function salvarRespostaPublica(req, res, next) {
  try {
    const questionario = await query(
      'SELECT id, campanha_id, cargo FROM pesquisa_questionarios WHERE slug=$1 AND ativo=true',
      [req.params.slug]
    );
    if (!questionario.rows[0]) return res.status(404).json({ erro: 'Questionario nao encontrado.' });
    return salvarRespostaComDados(req, res, next, questionario.rows[0], true);
  } catch (err) { next(err); }
}

async function salvarResposta(req, res, next) {
  try {
    if (req.usuario.nivel === 'visualizador') {
      return res.status(403).json({ erro: 'Visualizadores nao podem registrar pesquisa.' });
    }
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const questionario = await query(
      'SELECT id, campanha_id, cargo FROM pesquisa_questionarios WHERE id=$1 AND campanha_id=$2 AND ativo=true',
      [req.params.id, req.usuario.campanha_id]
    );
    if (!questionario.rows[0]) return res.status(404).json({ erro: 'Questionario nao encontrado.' });
    return salvarRespostaComDados(req, res, next, questionario.rows[0], false);
  } catch (err) { next(err); }
}

async function salvarRespostaComDados(req, res, next, questionario, publico) {
  try {
    const idade = req.body.idade ? Number(req.body.idade) : null;
    if (idade && (idade < 16 || idade > 120)) return res.status(400).json({ erro: 'Idade invalida.' });

    const resultado = await query(
      `INSERT INTO pesquisa_respostas (
        questionario_id, campanha_id, entrevistado_nome, anonimo, idade, genero, renda, escolaridade,
        religiao, ocupacao, bairro, cidade, regiao_administrativa, zona_eleitoral, secao_eleitoral,
        intencao_voto, segunda_opcao, rejeicao, avaliacao_governo, problemas_prioritarios,
        conhece_candidato, interesse_voluntario, probabilidade_voto, cargo_pesquisado,
        origem_resposta, pagina_parceira, campanha_divulgacao, link_usado, ra_divulgacao,
        respostas, entrevistado_em
       ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31
       ) RETURNING *`,
      [
        questionario.id, questionario.campanha_id,
        req.body.anonimo === false ? limparTexto(req.body.entrevistado_nome) : null,
        req.body.anonimo !== false,
        idade, limparTexto(req.body.genero, 50), limparTexto(req.body.renda, 100),
        limparTexto(req.body.escolaridade, 100), limparTexto(req.body.religiao, 100),
        limparTexto(req.body.ocupacao, 150), limparTexto(req.body.bairro, 150),
        limparTexto(req.body.cidade, 150), limparTexto(req.body.regiao_administrativa, 150),
        req.body.zona_eleitoral || null, req.body.secao_eleitoral || null,
        limparTexto(req.body.intencao_voto), limparTexto(req.body.segunda_opcao),
        limparTexto(req.body.rejeicao), limparTexto(req.body.avaliacao_governo, 100),
        limparTexto(req.body.problemas_prioritarios, 2000),
        req.body.conhece_candidato === undefined ? null : Boolean(req.body.conhece_candidato),
        req.body.interesse_voluntario === undefined ? null : Boolean(req.body.interesse_voluntario),
        req.body.probabilidade_voto === undefined ? null : Number(req.body.probabilidade_voto),
        limparTexto(req.body.cargo_pesquisado, 100) || questionario.cargo,
        limparTexto(req.body.origem_resposta, 100) || (publico ? 'link_publico' : 'interno'),
        limparTexto(req.body.pagina_parceira),
        limparTexto(req.body.campanha_divulgacao),
        limparTexto(req.body.link_usado, 500),
        limparTexto(req.body.ra_divulgacao, 150),
        JSON.stringify(req.body.respostas || {}),
        req.body.entrevistado_em || new Date().toISOString(),
      ]
    );
    return res.status(201).json({ mensagem: 'Resposta registrada.', resposta: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function estatisticas(req, res, next) {
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const params = [req.params.id, req.usuario.campanha_id];

    const total = await query(
      'SELECT COUNT(*)::int AS total FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2',
      params
    );
    const intencao = await query(
      `SELECT COALESCE(intencao_voto, 'Nao informado') AS nome, COUNT(*)::int AS total
       FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2
       GROUP BY COALESCE(intencao_voto, 'Nao informado') ORDER BY total DESC`,
      params
    );
    const rejeicao = await query(
      `SELECT COALESCE(rejeicao, 'Nao informado') AS nome, COUNT(*)::int AS total
       FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2
       GROUP BY COALESCE(rejeicao, 'Nao informado') ORDER BY total DESC`,
      params
    );
    const regional = await query(
      `SELECT COALESCE(regiao_administrativa, bairro, cidade, 'Sem regiao') AS regiao,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE interesse_voluntario = true)::int AS voluntarios
       FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2
       GROUP BY COALESCE(regiao_administrativa, bairro, cidade, 'Sem regiao')
       ORDER BY total DESC LIMIT 20`,
      params
    );
    const indicadores = await query(
      `SELECT
        COUNT(*) FILTER (WHERE conhece_candidato = true)::int AS conhecem,
        COUNT(*) FILTER (WHERE interesse_voluntario = true)::int AS voluntarios,
        ROUND(AVG(idade), 1) AS idade_media
       FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2`,
      params
    );

    const porCargo = await query(
      `SELECT COALESCE(cargo_pesquisado, 'Sem cargo') AS cargo,
              COALESCE(intencao_voto, 'Nao informado') AS candidato,
              COUNT(*)::int AS total
       FROM pesquisa_respostas WHERE questionario_id=$1 AND campanha_id=$2
       GROUP BY COALESCE(cargo_pesquisado, 'Sem cargo'), COALESCE(intencao_voto, 'Nao informado')
       ORDER BY cargo, total DESC`,
      params
    );

    return res.json({
      total: total.rows[0].total,
      intencao: intencao.rows,
      rejeicao: rejeicao.rows,
      regional: regional.rows,
      por_cargo: porCargo.rows,
      indicadores: indicadores.rows[0],
      aviso_legal: AVISO_LEGAL,
    });
  } catch (err) { next(err); }
}

async function criarOrigem(req, res, next) {
  try {
    if (!uuidValido(req.params.id)) return res.status(400).json({ erro: 'Identificador invalido.' });
    const q = await query(
      'SELECT id, slug FROM pesquisa_questionarios WHERE id=$1 AND campanha_id=$2',
      [req.params.id, req.usuario.campanha_id]
    );
    if (!q.rows[0]) return res.status(404).json({ erro: 'Questionario nao encontrado.' });
    const nome = limparTexto(req.body.nome);
    if (!nome) return res.status(400).json({ erro: 'Nome da origem e obrigatorio.' });
    const link = `/pesquisa-publica/${q.rows[0].slug}?origem=${encodeURIComponent(nome)}`;
    const resultado = await query(
      `INSERT INTO pesquisa_origens_divulgacao
       (questionario_id, campanha_id, nome, tipo, ra, cidade, link_gerado)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        req.params.id, req.usuario.campanha_id, nome, limparTexto(req.body.tipo, 50) || 'pagina_local',
        limparTexto(req.body.ra, 150), limparTexto(req.body.cidade, 150), link,
      ]
    );
    return res.status(201).json({ origem: resultado.rows[0] });
  } catch (err) { next(err); }
}

async function listarOrigens(req, res, next) {
  try {
    const resultado = await query(
      `SELECT o.*
       FROM pesquisa_origens_divulgacao o
       JOIN pesquisa_questionarios q ON q.id=o.questionario_id
       WHERE o.questionario_id=$1 AND q.campanha_id=$2
       ORDER BY o.created_at DESC`,
      [req.params.id, req.usuario.campanha_id]
    );
    return res.json({ dados: resultado.rows });
  } catch (err) { next(err); }
}

module.exports = {
  listarQuestionarios,
  criarQuestionario,
  buscarQuestionarioPublico,
  salvarRespostaPublica,
  salvarResposta,
  estatisticas,
  criarOrigem,
  listarOrigens,
  AVISO_LEGAL,
};
