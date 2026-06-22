const { query } = require('../config/db');

const LIMITE_DADOS_EXTRAIDOS = 5 * 1024 * 1024;

function validarTamanho(dados) {
  const tamanho = Buffer.byteLength(JSON.stringify(dados || {}), 'utf8');
  if (tamanho <= LIMITE_DADOS_EXTRAIDOS) return;

  const erro = new Error('Os dados extraidos da planilha excedem o limite seguro.');
  erro.status = 413;
  throw erro;
}

async function salvarPlanilhaEspecial({ tipo, dados, campanhaId, usuarioId, nomeArquivo }) {
  validarTamanho(dados);

  if (tipo === 'campanha') {
    const resultado = await query(
      `INSERT INTO planos_campanha
       (campanha_id, importado_por, arquivo_nome, configuracao, cronograma, metas)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        campanhaId,
        usuarioId,
        nomeArquivo,
        JSON.stringify(dados.configuracao || {}),
        JSON.stringify(dados.cronograma || []),
        JSON.stringify(dados.metas || []),
      ]
    );

    return {
      mensagem: 'Plano de Campanha importado com sucesso.',
      tipo: 'PLANO_CAMPANHA',
      id: resultado.rows[0].id,
      created_at: resultado.rows[0].created_at,
      totais: {
        acoes_cronograma: (dados.cronograma || []).length,
        metas: (dados.metas || []).length,
      },
    };
  }

  if (tipo === 'pesquisa') {
    const resultado = await query(
      `INSERT INTO pesquisas_voto
       (campanha_id, importado_por, arquivo_nome, entrevistas, por_candidato, por_tema)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        campanhaId,
        usuarioId,
        nomeArquivo,
        JSON.stringify(dados.entrevistas || []),
        JSON.stringify(dados.por_candidato || []),
        JSON.stringify(dados.por_tema || []),
      ]
    );

    return {
      mensagem: 'Pesquisa de Intencao de Voto importada com sucesso.',
      tipo: 'PESQUISA_VOTO',
      id: resultado.rows[0].id,
      created_at: resultado.rows[0].created_at,
      totais: {
        entrevistas: (dados.entrevistas || []).length,
        por_candidato: (dados.por_candidato || []).length,
        por_tema: (dados.por_tema || []).length,
      },
    };
  }

  if (tipo === 'financeiro') {
    const resultado = await query(
      `INSERT INTO importacoes_financeiro
       (campanha_id, importado_por, arquivo_nome, receitas, despesas, prestacao)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        campanhaId,
        usuarioId,
        nomeArquivo,
        JSON.stringify(dados.receitas || []),
        JSON.stringify(dados.despesas || []),
        JSON.stringify(dados.prestacao || []),
      ]
    );

    return {
      mensagem: 'Financeiro Eleitoral TSE importado com sucesso.',
      tipo: 'FINANCEIRO',
      id: resultado.rows[0].id,
      created_at: resultado.rows[0].created_at,
      totais: {
        receitas: (dados.receitas || []).length,
        despesas: (dados.despesas || []).length,
        prestacao: (dados.prestacao || []).length,
      },
    };
  }

  const erro = new Error('Tipo de planilha nao reconhecido.');
  erro.status = 422;
  throw erro;
}

module.exports = { salvarPlanilhaEspecial };
