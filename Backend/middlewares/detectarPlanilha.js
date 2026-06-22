const ExcelJS = require('exceljs');

const ASSINATURAS = {
  PLANO_CAMPANHA: [
    'fase','area','meta','indicador','meta numerica','realizado',
    '% atingido','dia','data','semana','tarefa','acao','responsavel',
    'status','prioridade','tarefa / acao','cronograma',
  ],
  PESQUISA_VOTO: [
    'no','no','data','entrevistador','bairro','rua','localidade',
    'nome','faixa etaria','intencao de voto','situacao eleitoral',
    'tema mais importante','candidato','% do total','rua / localidade',
    'zona','secao','partido',
  ],
  FINANCEIRO: [
    'tipo de receita','doador','origem','valor','cpf','cnpj',
    'forma de recebimento','fornecedor','beneficiario','nf','recibo',
    'prazo tse','categoria','despesa','receita','data','competencia',
    'cpf/cnpj','nf/recibo','fornecedor/beneficiario','doador / origem',
  ],
};

const PONTUACAO_MINIMA = 0.35;

// Listas de eleitores compartilham colunas territoriais com pesquisas (bairro,
// zona e secao). A presenca de nome junto com dados pessoais/de contato deve
// prevalecer para evitar que sejam classificadas como pesquisa de voto.
function ehPlanilhaEleitores(cabecalhos) {
  const tem = function(termos) {
    return cabecalhos.some(cab => termos.some(termo => cabecalhoBate(cab, [termo])));
  };
  const temNome = tem(['nome', 'nome completo', 'eleitor']);
  const gruposPessoais = [
    ['cpf', 'documento'],
    ['telefone', 'fone', 'celular', 'whatsapp'],
    ['email', 'e mail'],
    ['titulo eleitor', 'titulo eleitoral', 'titulo_eleitor'],
    ['data nascimento', 'nascimento', 'data_nascimento'],
    ['endereco', 'logradouro', 'rua'],
    ['cep'],
  ];
  const encontrados = gruposPessoais.filter(tem).length;
  return temNome && encontrados >= 2;
}

function normalizar(str) {
  if (!str || typeof str !== 'string') return '';
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s%\/]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cabecalhoBate(cab, chaves) {
  for (const chave of chaves) {
    if (cab.includes(chave) || chave.includes(cab)) return true;
  }
  return false;
}

function calcularPontuacao(cabecalhos, palavras) {
  if (!cabecalhos.length || !palavras.length) return 0;
  const chavesNorm = palavras.map(normalizar);
  let encontradas = 0;
  for (const chave of chavesNorm) {
    if (cabecalhos.some(c => cabecalhoBate(c, [chave]))) encontradas++;
  }
  return encontradas / chavesNorm.length;
}

// Extrai cabeçalhos de uma aba, pulando linhas de fórmulas
function extrairCabecalhosAba(sheet) {
  const cabecalhos = [];
  let encontrou = false;
  sheet.eachRow(function(row, rowNumber) {
    if (encontrou || rowNumber > 15) return;
    const cells = [];
    row.eachCell({ includeEmpty: false }, function(cell) {
      const v = cell.value;
      // Pula células com fórmulas
      if (v && typeof v === 'object' && v.formula) return;
      if (v && typeof v === 'object' && v.result !== undefined) {
        const r = String(v.result).trim();
        if (r) cells.push(normalizar(r));
        return;
      }
      const s = String(v || '').trim();
      if (s) cells.push(normalizar(s));
    });
    if (cells.length >= 2) {
      cells.forEach(c => cabecalhos.push(c));
      encontrou = true;
    }
  });
  return cabecalhos;
}

async function detectarTipoPlanilha(buffer, _nomeOriginal) {

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (err) {
    return {
      tipo: null, abaIdentificada: null, pontuacao: 0,
      cabecalhosEncontrados: [], todasAbas: [],
      erro: 'Nao foi possivel ler o arquivo enviado.',
    };
  }

  const sheets = wb.worksheets;
  if (!sheets.length) {
    return { tipo: null, abaIdentificada: null, pontuacao: 0, cabecalhosEncontrados: [], todasAbas: [], erro: 'O arquivo não contém nenhuma aba.' };
  }

  // Detecção rápida pelo nome das abas
  const nomesLower = sheets.map(s => s.name.toLowerCase());
  const temReceitas  = nomesLower.some(n => n.includes('receita'));
  const temDespesas  = nomesLower.some(n => n.includes('despesa'));
  const temCronograma = nomesLower.some(n => n.includes('cronograma'));
  const temMetas      = nomesLower.some(n => n.includes('meta'));
  const temEntrevistas = nomesLower.some(n => n.includes('entrevista'));
  const temCandidato   = nomesLower.some(n => n.includes('candidato'));

  let tipoRapido = null;
  let abaRapida  = null;

  if (temReceitas && temDespesas) {
    tipoRapido = 'FINANCEIRO';
    abaRapida  = sheets.find(s => s.name.toLowerCase().includes('receita'))?.name;
  } else if (temCronograma && temMetas) {
    tipoRapido = 'PLANO_CAMPANHA';
    abaRapida  = sheets.find(s => s.name.toLowerCase().includes('cronograma'))?.name;
  } else if (temEntrevistas && temCandidato) {
    tipoRapido = 'PESQUISA_VOTO';
    abaRapida  = sheets.find(s => s.name.toLowerCase().includes('entrevista'))?.name;
  }

  if (tipoRapido) {
    return {
      tipo: tipoRapido,
      abaIdentificada: abaRapida || sheets[0].name,
      pontuacao: 90,
      cabecalhosEncontrados: [],
      todasAbas: sheets.map(s => ({ nome: s.name, tipo: tipoRapido, pontuacao: 90, pontuacoes: { [tipoRapido]: 90 } })),
      erro: null,
    };
  }

  // Se o nome da aba nao ajudar, compara a pontuacao dos cabecalhos.
  const resultados = [];
  for (const sheet of sheets) {
    const cabecalhos = extrairCabecalhosAba(sheet);
    const pontuacoes = {};
    if (ehPlanilhaEleitores(cabecalhos)) {
      pontuacoes.ELEITORES = 1;
    }
    for (const [tipo, palavras] of Object.entries(ASSINATURAS)) {
      pontuacoes[tipo] = calcularPontuacao(cabecalhos, palavras);
    }
    const melhor = Object.entries(pontuacoes).sort(([,a],[,b]) => b - a)[0];
    resultados.push({
      nome: sheet.name,
      tipo: melhor[1] >= PONTUACAO_MINIMA ? melhor[0] : null,
      pontuacao: melhor[1],
      melhorTipo: melhor[0],
      cabecalhos,
      pontuacoes,
    });
  }

  const melhorAba = resultados.filter(a => a.tipo).sort((a,b) => b.pontuacao - a.pontuacao)[0];
  const todasAbas = resultados.map(a => ({
    nome: a.nome, tipo: a.tipo,
    cabecalhos: a.cabecalhos,
    pontuacao: Math.round(a.pontuacao * 100),
    pontuacoes: Object.fromEntries(Object.entries(a.pontuacoes).map(([k,v]) => [k, Math.round(v*100)])),
  }));

  if (!melhorAba) {
    const primeiraComCabecalho = resultados.find(a => a.cabecalhos.length) || resultados[0];
    return {
      tipo: null, abaIdentificada: primeiraComCabecalho?.nome || null, pontuacao: 0,
      cabecalhosEncontrados: primeiraComCabecalho?.cabecalhos || [],
      todasAbas,
      erro: 'Planilha não reconhecida. Abas: [' + sheets.map(s=>s.name).join(', ') + '].',
    };
  }

  return {
    tipo: melhorAba.tipo,
    abaIdentificada: melhorAba.nome,
    pontuacao: Math.round(melhorAba.pontuacao * 100),
    cabecalhosEncontrados: melhorAba.cabecalhos,
    todasAbas,
    erro: null,
  };
}

async function extrairDadosBrutos(buffer, maxLinhasPorAba) {
  maxLinhasPorAba = maxLinhasPorAba || 50;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const resultado = {};
  for (const sheet of wb.worksheets) {
    const cabecalhos = extrairCabecalhosAba(sheet);
    const linhas = [];
    let headerFound = false;
    sheet.eachRow(function(row) {
      if (linhas.length >= maxLinhasPorAba) return;
      if (!headerFound) {
        const cells = [];
        row.eachCell({includeEmpty:false}, function(cell) {
          const v = cell.value;
          if (v && typeof v === 'object' && v.formula) return;
          if (String(v||'').trim()) cells.push(String(v).trim());
        });
        if (cells.length >= 2) { headerFound = true; }
        return;
      }
      const obj = {};
      row.eachCell({includeEmpty:false}, function(cell, col) {
        if (cabecalhos[col-1]) obj[cabecalhos[col-1]] = cell.value;
      });
      if (Object.keys(obj).length) linhas.push(obj);
    });
    resultado[sheet.name] = { cabecalhos, linhas };
  }
  return { abas: resultado };
}

module.exports = { detectarTipoPlanilha, extrairDadosBrutos, PONTUACAO_MINIMA, ASSINATURAS };
