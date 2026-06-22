// serviço TSE — simula dados históricos e compara com as metas da campanha
const { query } = require('../config/db');

// simula dados históricos do TSE pra uma zona e seção
// em produção isso aqui seria substituído pela API oficial do TSE
function simularDadosHistoricosTSE(zonaEleitoral, secaoEleitoral) {
  const zona = parseInt(zonaEleitoral, 10) || 1;
  const secao = parseInt(secaoEleitoral, 10) || 1;

  // calculo determinístico pra simular um padrão regional consistente
  const baseEleitores = 200 + (zona * 47) + (secao * 13);
  const percentualHistorico = 35 + ((zona + secao) % 25);
  const votosHistoricos = Math.floor(baseEleitores * (percentualHistorico / 100));

  return {
    zona_eleitoral: zona,
    secao_eleitoral: secao,
    ano_referencia: 2022,
    eleitores_aptos: baseEleitores,
    comparecimento_percentual: 78 + (secao % 12),
    votos_candidato_similar: votosHistoricos,
    percentual_votos_candidato_similar: percentualHistorico,
    fonte: 'SIMULACAO_TSE',
    observacao: 'Dados simulados para demonstracao. Integrar API oficial do TSE em producao.',
  };
}

// busca os eleitores agrupados por zona e seção no banco da campanha
async function obterEleitoresPorZonaSecao(campanhaId) {
  const resultado = await query(
    `SELECT
       e.zona_eleitoral,
       e.secao_eleitoral,
       COUNT(*)::int AS total_cadastrados,
       COUNT(*) FILTER (WHERE e.status_voto = 'confirmado')::int AS votos_confirmados,
       COUNT(*) FILTER (WHERE e.status_voto = 'provavel')::int AS votos_provaveis,
       COUNT(*) FILTER (WHERE e.status_voto = 'indeciso')::int AS votos_indecisos
     FROM eleitores e
     WHERE e.campanha_id = $1
       AND e.zona_eleitoral IS NOT NULL
       AND e.secao_eleitoral IS NOT NULL
     GROUP BY e.zona_eleitoral, e.secao_eleitoral
     ORDER BY e.zona_eleitoral, e.secao_eleitoral`,
    [campanhaId]
  );

  return resultado.rows;
}

// soma as metas de todos os apoiadores ativos da campanha
async function obterMetasApoiadores(campanhaId) {
  const resultado = await query(
    `SELECT
       COALESCE(SUM(meta_cadastros), 0)::int       AS meta_cadastros_total,
       COALESCE(SUM(meta_votos), 0)::int          AS meta_votos_total,
       COALESCE(SUM(cadastros_realizados), 0)::int AS cadastros_realizados_total,
       COALESCE(SUM(votos_confirmados), 0)::int    AS votos_confirmados_apoiadores,
       COUNT(*)::int                               AS total_apoiadores_ativos
     FROM apoiadores
     WHERE campanha_id = $1
       AND ativo = true`,
    [campanhaId]
  );

  return resultado.rows[0];
}

// compara os dados do TSE simulado com os resultados reais da campanha
function compararComMetas(dadosTSE, dadosCampanha, metasApoiadores) {
  const confirmadosCampanha = dadosCampanha?.votos_confirmados || 0;
  const votosHistoricosTSE = dadosTSE.votos_candidato_similar;

  const diferencaVsHistorico = confirmadosCampanha - votosHistoricosTSE;

  // evito divisão por zero aqui
  const percentualAlcanceHistorico = votosHistoricosTSE > 0
    ? Math.round((confirmadosCampanha / votosHistoricosTSE) * 100)
    : 0;

  const metaVotos = metasApoiadores?.meta_votos_total || 0;
  const percentualAlcanceMeta = metaVotos > 0
    ? Math.round((confirmadosCampanha / metaVotos) * 100)
    : 0;

  // classifica o status da meta em três categorias
  let statusMeta = 'abaixo_meta';
  if (percentualAlcanceMeta >= 100) {
    statusMeta = 'meta_atingida';
  } else if (percentualAlcanceMeta >= 70) {
    statusMeta = 'proximo_meta';
  }

  return {
    votos_confirmados_campanha: confirmadosCampanha,
    votos_historicos_tse: votosHistoricosTSE,
    diferenca_vs_historico: diferencaVsHistorico,
    percentual_alcance_historico: percentualAlcanceHistorico,
    meta_votos_apoiadores: metaVotos,
    votos_confirmados_apoiadores: metasApoiadores?.votos_confirmados_apoiadores || 0,
    percentual_alcance_meta: percentualAlcanceMeta,
    status_meta: statusMeta,
  };
}

// salva a consulta TSE no banco pra ter histórico de auditoria
async function registrarConsultaTSE(dados) {
  const resultado = await query(
    `INSERT INTO consultas_tse (
       campanha_id, consultado_por, tipo_consulta, parametros, resposta, sucesso, mensagem_erro
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      dados.campanha_id,
      dados.consultado_por || null,
      dados.tipo_consulta,
      JSON.stringify(dados.parametros || {}),
      JSON.stringify(dados.resposta || {}),
      dados.sucesso !== false,
      dados.mensagem_erro || null,
    ]
  );

  return resultado.rows[0];
}

// gera o relatório completo da campanha — todas as zonas e seções
async function gerarRelatorioCampanha(campanhaId, usuarioId) {
  const eleitoresPorZona = await obterEleitoresPorZonaSecao(campanhaId);
  const metasApoiadores = await obterMetasApoiadores(campanhaId);

  const analisesPorRegiao = [];
  let totalConfirmados = 0;
  let totalCadastrados = 0;

  // percorro cada zona/seção e monto a análise comparativa
  for (let i = 0; i < eleitoresPorZona.length; i++) {
    const registro = eleitoresPorZona[i];
    const dadosTSE = simularDadosHistoricosTSE(registro.zona_eleitoral, registro.secao_eleitoral);
    const comparacao = compararComMetas(dadosTSE, registro, metasApoiadores);

    totalConfirmados += registro.votos_confirmados;
    totalCadastrados += registro.total_cadastrados;

    analisesPorRegiao.push({
      zona_eleitoral: registro.zona_eleitoral,
      secao_eleitoral: registro.secao_eleitoral,
      campanha: registro,
      tse_simulado: dadosTSE,
      comparacao,
    });
  }

  // resumo executivo com os totais gerais
  const resumoExecutivo = {
    total_regioes_analisadas: analisesPorRegiao.length,
    total_eleitores_cadastrados: totalCadastrados,
    total_votos_confirmados: totalConfirmados,
    meta_votos_apoiadores: metasApoiadores?.meta_votos_total || 0,
    percentual_meta_geral: metasApoiadores?.meta_votos_total > 0
      ? Math.round((totalConfirmados / metasApoiadores.meta_votos_total) * 100)
      : 0,
    metas_apoiadores: metasApoiadores,
  };

  const relatorio = {
    campanha_id: campanhaId,
    gerado_em: new Date().toISOString(),
    resumo_executivo: resumoExecutivo,
    regioes: analisesPorRegiao,
  };

  // salvo no histórico de consultas
  await registrarConsultaTSE({
    campanha_id: campanhaId,
    consultado_por: usuarioId,
    tipo_consulta: 'relatorio_campanha_completo',
    parametros: { campanha_id: campanhaId },
    resposta: relatorio,
    sucesso: true,
  });

  return relatorio;
}

// gera o relatório de uma zona e seção específica
async function gerarRelatorioZonaSecao(campanhaId, zonaEleitoral, secaoEleitoral, usuarioId) {
  const dadosTSE = simularDadosHistoricosTSE(zonaEleitoral, secaoEleitoral);

  const resultadoCampanha = await query(
    `SELECT
       COUNT(*)::int AS total_cadastrados,
       COUNT(*) FILTER (WHERE status_voto = 'confirmado')::int AS votos_confirmados,
       COUNT(*) FILTER (WHERE status_voto = 'provavel')::int AS votos_provaveis
     FROM eleitores
     WHERE campanha_id = $1
       AND zona_eleitoral = $2
       AND secao_eleitoral = $3`,
    [campanhaId, zonaEleitoral, secaoEleitoral]
  );

  // se não achar dados, uso zeros pra não quebrar
  const dadosCampanha = resultadoCampanha.rows[0] || {
    total_cadastrados: 0,
    votos_confirmados: 0,
    votos_provaveis: 0,
  };

  const metasApoiadores = await obterMetasApoiadores(campanhaId);

  const comparacao = compararComMetas(
    dadosTSE,
    { votos_confirmados: dadosCampanha.votos_confirmados },
    metasApoiadores
  );

  const relatorio = {
    campanha_id: campanhaId,
    zona_eleitoral: parseInt(zonaEleitoral, 10),
    secao_eleitoral: parseInt(secaoEleitoral, 10),
    gerado_em: new Date().toISOString(),
    tse_simulado: dadosTSE,
    campanha: dadosCampanha,
    comparacao,
    metas_apoiadores: metasApoiadores,
  };

  await registrarConsultaTSE({
    campanha_id: campanhaId,
    consultado_por: usuarioId,
    tipo_consulta: 'relatorio_zona_secao',
    parametros: { zona_eleitoral: zonaEleitoral, secao_eleitoral: secaoEleitoral },
    resposta: relatorio,
    sucesso: true,
  });

  return relatorio;
}

module.exports = {
  simularDadosHistoricosTSE,
  gerarRelatorioCampanha,
  gerarRelatorioZonaSecao,
  obterEleitoresPorZonaSecao,
  obterMetasApoiadores,
};
