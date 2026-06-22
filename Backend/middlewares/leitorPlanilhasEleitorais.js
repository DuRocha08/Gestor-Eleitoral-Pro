const ExcelJS = require('exceljs');

const MAX_ABAS = 20;
const MAX_LINHAS_POR_ABA = 10000;
const MAX_COLUNAS_POR_ABA = 100;

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

const PERFIS = {
  configuracao: { nomes: ['configuracao','config','dados da campanha','informacoes da campanha'], cabecalhos: [] },
  cronograma: { nomes: ['cronograma','planejamento','agenda','plano de acao'], cabecalhos: [['dia','data'],['tarefa','acao','atividade'],['responsavel'],['status','situacao']] },
  metas: { nomes: ['metas','objetivos','indicadores'], cabecalhos: [['fase','etapa'],['meta','objetivo'],['indicador'],['realizado','resultado']] },
  receitas: { nomes: ['receitas','entradas','arrecadacao','doacoes'], cabecalhos: [['tipo de receita','receita'],['doador','origem'],['valor']] },
  despesas: { nomes: ['despesas','gastos','saidas','pagamentos'], cabecalhos: [['categoria'],['fornecedor','beneficiario'],['valor']] },
  prestacao: { nomes: ['prestacao de contas','documentos','comprovantes'], cabecalhos: [['item'],['prazo tse','prazo'],['status','situacao']] },
  entrevistas: { nomes: ['entrevistas','respostas','questionarios','dados da pesquisa'], cabecalhos: [['entrevistador'],['bairro','localidade'],['intencao de voto','voto']] },
  candidatos: { nomes: ['por candidato','candidatos','resultado por candidato','intencao de voto'], cabecalhos: [['candidato'],['entrevistados','respostas','total'],['porcentagem','percentual','do total']] },
  temas: { nomes: ['por tema','temas','prioridades','assuntos'], cabecalhos: [['tema','assunto'],['respostas','total'],['porcentagem','percentual','do total']] },
};

function dadosDaLinha(row) {
  const valores = [];
  row.eachCell({ includeEmpty: false }, cell => {
    let valor = cell.value;
    if (valor && typeof valor === 'object' && valor.result !== undefined) valor = valor.result;
    const texto = normalizar(valor);
    if (texto) valores.push(texto);
  });
  return valores;
}

function bate(valor, opcoes) {
  const texto = ' ' + normalizar(valor) + ' ';
  return opcoes.some(function(opcao) {
    const termo = ' ' + normalizar(opcao) + ' ';
    return texto.includes(termo) || termo.includes(texto);
  });
}

function melhorCabecalho(sheet, perfil) {
  let melhor = { linha: null, pontos: 0 };
  for (let rn = 1; rn <= Math.min(sheet.rowCount, 15); rn++) {
    const valores = dadosDaLinha(sheet.getRow(rn));
    const pontos = perfil.cabecalhos.filter(grupo => valores.some(v => bate(v, grupo))).length;
    if (pontos > melhor.pontos) melhor = { linha: rn, pontos };
  }
  return melhor;
}

function encontrarAba(wb, perfilNome, ignorar = []) {
  const perfil = PERFIS[perfilNome];
  const candidatas = wb.worksheets.filter(sheet => !ignorar.includes(sheet));
  const avaliadas = candidatas.map(sheet => {
    const nome = normalizar(sheet.name);
    const nomeCompativel = perfil.nomes.some(alias => nome.includes(normalizar(alias)));
    const cabecalho = melhorCabecalho(sheet, perfil);
    return { sheet, cabecalho, pontos: (nomeCompativel ? 10 : 0) + cabecalho.pontos };
  }).sort((a, b) => b.pontos - a.pontos);
  const melhor = avaliadas[0];
  if (!melhor || (melhor.pontos < 10 && melhor.cabecalho.pontos < Math.min(3, perfil.cabecalhos.length))) return null;
  return melhor;
}

function lerAba(encontrada, linhaPadrao) {
  if (!encontrada) return [];
  const sheet = encontrada.sheet;
  const headerRow = encontrada.cabecalho.linha || linhaPadrao;
  const cabecalhos = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    cabecalhos[col] = cell.value ? String(cell.value).trim() : null;
  });
  const linhas = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const obj = {};
    let temDado = false;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const chave = cabecalhos[col];
      if (!chave) return;
      let val = cell.value;
      if (val && typeof val === 'object' && val.result !== undefined) val = val.result;
      if (val && typeof val === 'object' && val.formula) val = null;
      if (val instanceof Date) val = val.toLocaleDateString('pt-BR');
      if (val !== null && val !== undefined && val !== '') temDado = true;
      obj[chave] = val != null ? val : null;
    });
    if (temDado) linhas.push(obj);
  });
  return linhas;
}

function linhasNumeradas(linhas) {
  return linhas.filter(function(linha) {
    const chave = Object.keys(linha).find(k => ['n','no','numero'].includes(normalizar(k)));
    return chave && !isNaN(parseInt(linha[chave], 10));
  });
}

async function detectarTipoPlanilhaEleitoral(entrada) {
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(entrada)) await wb.xlsx.load(entrada);
  else if (typeof entrada === 'string') await wb.xlsx.readFile(entrada);
  else throw new Error('O arquivo deve ser um Buffer ou caminho valido.');

  if (wb.worksheets.length > MAX_ABAS) {
    throw new Error('A planilha deve ter no maximo 20 abas.');
  }
  for (const sheet of wb.worksheets) {
    if (sheet.rowCount > MAX_LINHAS_POR_ABA || sheet.columnCount > MAX_COLUNAS_POR_ABA) {
      throw new Error('Cada aba deve ter no maximo 10000 linhas e 100 colunas.');
    }
  }

  const cronograma = encontrarAba(wb, 'cronograma');
  const receitas = encontrarAba(wb, 'receitas');
  const despesas = encontrarAba(wb, 'despesas', receitas ? [receitas.sheet] : []);
  const entrevistas = encontrarAba(wb, 'entrevistas');
  const candidatos = encontrarAba(wb, 'candidatos', entrevistas ? [entrevistas.sheet] : []);

  if (cronograma) {
    const configuracao = encontrarAba(wb, 'configuracao', [cronograma.sheet]);
    const metas = encontrarAba(wb, 'metas', [cronograma.sheet, configuracao?.sheet].filter(Boolean));
    if (!configuracao || !metas) throw new Error('Plano de campanha incompleto: informe as abas de configuracao, cronograma e metas.');
    const config = {};
    const campos = ['nome_candidato','cargo','cidade','numero_urna','coordenador',null,null,null,'data_eleicao','data_inicio_campanha'];
    campos.forEach((campo, i) => { if (campo) config[campo] = configuracao.sheet.getRow(i + 5).getCell(4).value ?? null; });
    return { tipo: 'campanha', configuracao: config, cronograma: lerAba(cronograma, 4), metas: lerAba(metas, 2) };
  }

  if (receitas && despesas) {
    const prestacao = encontrarAba(wb, 'prestacao', [receitas.sheet, despesas.sheet]);
    if (!prestacao) throw new Error('Planilha financeira incompleta: informe receitas, despesas e prestacao de contas.');
    return { tipo: 'financeiro', receitas: linhasNumeradas(lerAba(receitas, 5)), despesas: linhasNumeradas(lerAba(despesas, 5)), prestacao: lerAba(prestacao, 3) };
  }

  if (entrevistas && candidatos) {
    const temas = encontrarAba(wb, 'temas', [entrevistas.sheet, candidatos.sheet]);
    if (!temas) throw new Error('Planilha de pesquisa incompleta: informe entrevistas, resultados por candidato e resultados por tema.');
    return { tipo: 'pesquisa', entrevistas: linhasNumeradas(lerAba(entrevistas, 3)), por_candidato: lerAba(candidatos, 2), por_tema: lerAba(temas, 2) };
  }

  throw new Error('Planilha nao reconhecida. Abas encontradas: [' + wb.worksheets.map(s => s.name).join(', ') + '].');
}

module.exports = { detectarTipoPlanilhaEleitoral };
