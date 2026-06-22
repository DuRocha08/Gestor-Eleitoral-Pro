// controllers/importController.js
// Importacao de planilhas — recebe o arquivo, detecta o tipo e salva no banco.
// Tipos suportados:
//   → Eleitores:      processa linha a linha e insere na tabela eleitores
//   → Plano Campanha: salva os dados como JSON na tabela planos_campanha
//   → Pesquisa Voto:  salva os dados como JSON na tabela pesquisas_voto
//   → Financeiro TSE: salva os dados como JSON na tabela importacoes_financeiro

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse');
const { getClient } = require('../config/db');
const { detectarTipoPlanilhaEleitoral } = require('../middlewares/leitorPlanilhasEleitorais');
const { temAcessoAmplo } = require('../middlewares/authMiddleware');
const { limparNomeArquivo, validarArquivoXlsx } = require('../utils/arquivo');
const {
  uuidValido, cpfValido, normalizarCpf, limparTexto, normalizarEmail, emailValido,
} = require('../utils/validacao');
const { registrar, ACOES } = require('../utils/auditoria');
const { salvarPlanilhaEspecial } = require('../services/planilhaService');

function logDesenvolvimento(...argumentos) {
  if (process.env.NODE_ENV !== 'production') console.info(...argumentos);
}

function normalizarCabecalho(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buscarValorColuna(objeto, coluna) {
  if (Object.prototype.hasOwnProperty.call(objeto, coluna)) return objeto[coluna];
  const procurada = normalizarCabecalho(coluna);
  const encontrada = Object.keys(objeto).find(function(chave) {
    return normalizarCabecalho(chave) === procurada;
  });
  return encontrada ? objeto[encontrada] : null;
}

function buscarCampoMapeado(mapeamento, cabecalho) {
  const procurado = normalizarCabecalho(cabecalho);
  const coluna = Object.keys(mapeamento).find(function(chave) {
    return normalizarCabecalho(chave) === procurado;
  });
  return coluna ? mapeamento[coluna] : null;
}

function normalizarCpfPlanilha(valor, veioComoNumero = false) {
  if (valor === undefined || valor === null || valor === '') return null;

  let digitos = String(valor).replace(/\D/g, '');
  if (!digitos) return limparTexto(valor, 14);
  if (veioComoNumero && digitos.length < 11) {
    digitos = digitos.padStart(11, '0');
  }
  return normalizarCpf(digitos);
}

function logDiagnosticoCpf(valor, normalizado, linha) {
  if (process.env.NODE_ENV === 'production' || process.env.DEBUG_IMPORTACAO_CPF !== 'true') return;

  const recebidos = String(valor ?? '').replace(/\D/g, '');
  const finais = String(normalizado || '').replace(/\D/g, '').slice(-2).padStart(2, '*');
  console.info('[IMPORTACAO CPF]', {
    linha,
    tipo_recebido: typeof valor,
    digitos_recebidos: recebidos.length,
    digitos_normalizados: String(normalizado || '').replace(/\D/g, '').length,
    zeros_adicionados: Math.max(0, 11 - recebidos.length),
    final_mascarado: '**' + finais,
    valido: cpfValido(normalizado),
  });
}

// guarda os jobs de importação em memória enquanto o servidor está rodando
const jobs = new Map();
const MAX_LINHAS = 10000;
const MAX_COLUNAS = 100;
const MAX_TAMANHO_REGISTRO_CSV = 64 * 1024;

async function persistirJob(job, incluirArquivo = false) {
  try {
    await require('../config/db').query(
      `INSERT INTO jobs_importacao (
         id,campanha_id,usuario_id,status,progresso,total,processadas,inseridos,duplicados,erros,
         erro_fatal,nome_arquivo,mapeamento,arquivo_dados,ip_origem,concluido_em,atualizado_em
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16,NOW())
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,progresso=EXCLUDED.progresso,
       total=EXCLUDED.total,processadas=EXCLUDED.processadas,
       inseridos=EXCLUDED.inseridos,duplicados=EXCLUDED.duplicados,
       erros=EXCLUDED.erros,erro_fatal=EXCLUDED.erro_fatal,
       arquivo_dados=CASE WHEN $17 THEN EXCLUDED.arquivo_dados ELSE jobs_importacao.arquivo_dados END,
       concluido_em=EXCLUDED.concluido_em,atualizado_em=NOW()`,
      [
        job.id, job.campanha_id, job.usuario_id, job.status, job.progress || 0,
        job.total || 0, job.processadas || 0, job.inseridos || 0, job.duplicados || 0,
        JSON.stringify(job.erros || []), job.erro_fatal || null, job.nomeOriginal,
        JSON.stringify(job.mapeamento || {}), incluirArquivo ? job.buffer : null,
        job.ip_origem || null, job.concluido_em || null, incluirArquivo,
      ]
    );
  } catch (erro) {
    if (erro.code !== '42P01') throw erro;
  }
}

async function removerArquivoPersistido(jobId) {
  try {
    await require('../config/db').query('UPDATE jobs_importacao SET arquivo_dados=NULL WHERE id=$1', [jobId]);
  } catch (erro) {
    if (erro.code !== '42P01') throw erro;
  }
}

function agendarLimpezaJob(jobId) {
  const timer = setTimeout(function () {
    jobs.delete(jobId);
  }, 60 * 60 * 1000);
  timer.unref();
}

// campos que posso importar de uma planilha de eleitores
const CAMPOS_IMPORTAVEIS = [
  'nome', 'cpf', 'titulo_eleitor', 'data_nascimento',
  'telefone', 'whatsapp', 'email', 'endereco',
  'bairro', 'cidade', 'uf', 'cep',
  'zona_eleitoral', 'secao_eleitoral', 'observacoes',
];

// lê os primeiros 8 bytes do arquivo para identificar o formato (magic bytes)
function lerMagicBytes(req) {
  if (req.file.buffer) {
    return req.file.buffer.slice(0, 8);
  }
  const buf = Buffer.alloc(8);
  const fd  = fs.openSync(req.file.path, 'r');
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  return buf;
}

// apaga o arquivo temporário do disco após processar
function limparArquivo(caminhoArquivo) {
  if (caminhoArquivo) fs.unlink(caminhoArquivo, function () {});
}

// POST /api/voters/import — recebe o arquivo e inicia o processamento
async function importarPlanilha(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado. Use o campo "planilha" no FormData.' });
    }

    const nomeOriginal = limparNomeArquivo(req.file.originalname);
    const ehCsv = nomeOriginal.toLowerCase().endsWith('.csv');

    // arquivos XLSX comecam com a assinatura ZIP
    if (!ehCsv) {
      const magic  = lerMagicBytes(req);
      const hex    = magic.toString('hex');
      const ehXlsx = hex.startsWith('504b0304');
      if (!ehXlsx) {
        limparArquivo(req.file.path);
        return res.status(422).json({ erro: 'Arquivo invalido. Envie um .xlsx ou .csv.' });
      }
      try {
        validarArquivoXlsx(req.file.buffer || fs.readFileSync(req.file.path));
      } catch (erro) {
        limparArquivo(req.file.path);
        return res.status(422).json({ erro: erro.message });
      }
    }

    // tenta detectar se é uma planilha especial (campanha, financeiro, pesquisa)
    let tipoPlanilha  = null;
    let dadosPlanilha = null;

    if (!ehCsv) {
      try {
        const entrada = req.file.buffer || req.file.path;
        dadosPlanilha = await detectarTipoPlanilhaEleitoral(entrada);
        tipoPlanilha  = dadosPlanilha.tipo;
      } catch (e) {
        // não é planilha especial — vai tratar como lista de eleitores
        logDesenvolvimento('[importController] Planilha de eleitores detectada.');
        tipoPlanilha = null;
      }
    }

    // planilha especial: salva no banco e retorna resposta diretamente
    if (tipoPlanilha && tipoPlanilha !== 'eleitores') {
      if (tipoPlanilha === 'financeiro' && !temAcessoAmplo(req.usuario)) {
        limparArquivo(req.file.path);
        return res.status(403).json({ erro: 'Apenas coordenador ou admin podem importar dados financeiros.' });
      }
      const resultado = await salvarPlanilhaEspecial({
        tipo: tipoPlanilha,
        dados: dadosPlanilha,
        campanhaId: req.usuario.campanha_id,
        usuarioId: req.usuario.id,
        nomeArquivo: nomeOriginal,
      });
      await registrar({
        campanha_id: req.usuario.campanha_id,
        usuario_id: req.usuario.id,
        acao: ACOES.IMPORT_CONCLUIDO,
        entidade: 'importacao',
        entidade_id: resultado.id,
        ip: req.ip,
        antes: null,
        depois: { tipo: resultado.tipo, arquivo: nomeOriginal },
      });
      limparArquivo(req.file.path);
      return res.status(201).json(resultado);
    }

    // planilha de eleitores: processa em background com sistema de jobs
    let mapeamento;
    try {
      mapeamento = JSON.parse(req.body.mapeamento || '{}');
    } catch (_) {
      limparArquivo(req.file.path);
      return res.status(400).json({ erro: 'Mapeamento de colunas invalido (JSON malformado).' });
    }

    if (!mapeamento || typeof mapeamento !== 'object' || Array.isArray(mapeamento)) {
      limparArquivo(req.file.path);
      return res.status(400).json({ erro: 'Mapeamento de colunas invalido.' });
    }

    const colunasMapeadas = Object.keys(mapeamento);
    if (colunasMapeadas.length > 100) {
      limparArquivo(req.file.path);
      return res.status(400).json({ erro: 'O mapeamento deve ter no maximo 100 colunas.' });
    }

    // o campo nome é obrigatório no mapeamento
    if (!Object.values(mapeamento).includes('nome')) {
      limparArquivo(req.file.path);
      return res.status(400).json({ erro: 'O campo "nome" e obrigatorio no mapeamento de colunas.' });
    }

    // filtro os campos para aceitar apenas os campos permitidos
    const mapeamentoSeguro = Object.create(null);
    colunasMapeadas.forEach(function (col) {
      if (CAMPOS_IMPORTAVEIS.includes(mapeamento[col])) {
        mapeamentoSeguro[col] = mapeamento[col];
      }
    });

    // crio o job e respondo imediatamente (202 Accepted)
    const jobId = crypto.randomUUID();
    const bufferPersistente = req.file.buffer || fs.readFileSync(req.file.path);
    jobs.set(jobId, {
      id:           jobId,
      campanha_id:  req.usuario.campanha_id,
      usuario_id:   req.usuario.id,
      status:       'aguardando',
      progress:     0,
      total:        0,
      inseridos:    0,
      duplicados:   0,
      erros:        [],
      processadas:  0,
      arquivo:      req.file.path   || null,
      buffer:       bufferPersistente,
      nomeOriginal: nomeOriginal,
      mapeamento:   mapeamentoSeguro,
      criado_em:    new Date().toISOString(),
      ip_origem:    req.ip,
    });
    await persistirJob(jobs.get(jobId), true);

    await registrar({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.IMPORT_INICIADO,
      entidade: 'importacao',
      entidade_id: jobId,
      ip: req.ip,
      antes: null,
      depois: { tipo: 'ELEITORES', arquivo: nomeOriginal },
    });

    res.status(202).json({
      mensagem:   'Arquivo recebido. Processamento iniciado em segundo plano.',
      jobId,
      url_status: '/api/voters/import/' + jobId,
    });

    logDesenvolvimento('[importController] Importacao iniciada:', jobId);

    // processa o arquivo sem bloquear a resposta HTTP
    setImmediate(function () {
      processarArquivoBackground(jobId).catch(async function () {
        const job = jobs.get(jobId);
        if (job) {
          job.status     = 'erro';
          job.erro_fatal = 'A importacao nao pôde ser concluida.';
          limparArquivo(job.arquivo);
          await registrar({
            campanha_id: job.campanha_id,
            usuario_id: job.usuario_id,
            acao: ACOES.IMPORT_FALHA,
            entidade: 'importacao',
            entidade_id: job.id,
            ip: job.ip_origem,
            antes: null,
            depois: { tipo: 'ELEITORES' },
          });
          agendarLimpezaJob(jobId);
          await persistirJob(job);
          await removerArquivoPersistido(jobId);
        }
      });
    });

  } catch (err) {
    limparArquivo(req.file?.path);
    next(err);
  }
}

// processa o arquivo de eleitores em background (fora do ciclo HTTP)
async function processarArquivoBackground(jobId) {
  const job  = jobs.get(jobId);
  job.status = 'processando';

  let linhas;
  try {
    const entrada = job.buffer || job.arquivo;
    linhas        = await lerArquivo(entrada, job.nomeOriginal, job.mapeamento);
    job.total     = linhas.length;
    if (linhas.length > MAX_LINHAS) {
      throw new Error('limite de linhas excedido');
    }
  } catch (err) {
    job.status     = 'erro';
    job.erro_fatal = err.message === 'limite de linhas excedido'
      ? 'A planilha deve ter no maximo 10000 linhas.'
      : 'Nao foi possivel ler o arquivo enviado.';
    limparArquivo(job.arquivo);
    await registrar({
      campanha_id: job.campanha_id,
      usuario_id: job.usuario_id,
      acao: ACOES.IMPORT_FALHA,
      entidade: 'importacao',
      entidade_id: job.id,
      ip: job.ip_origem,
      antes: null,
      depois: { tipo: 'ELEITORES' },
    });
    agendarLimpezaJob(jobId);
    await persistirJob(job);
    await removerArquivoPersistido(jobId);
    return;
  }

  // processo em lotes de 100 para não travar o banco
  const TAMANHO_LOTE = 100;
  for (let i = job.processadas || 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    await processarLote(job, lote, i);
    job.progress = Math.round(((i + lote.length) / linhas.length) * 100);
    job.processadas = i + lote.length;
    await persistirJob(job);
  }

  job.status       = 'concluido';
  job.concluido_em = new Date().toISOString();
  limparArquivo(job.arquivo);
  await registrar({
    campanha_id: job.campanha_id,
    usuario_id: job.usuario_id,
    acao: ACOES.IMPORT_CONCLUIDO,
    entidade: 'importacao',
    entidade_id: job.id,
    ip: job.ip_origem,
    antes: null,
    depois: {
      tipo: 'ELEITORES',
      total: job.total,
      inseridos: job.inseridos,
      duplicados: job.duplicados,
      total_erros: job.erros.length,
    },
  });
  agendarLimpezaJob(jobId);
  await persistirJob(job);
  await removerArquivoPersistido(jobId);
  logDesenvolvimento('[importController] Importacao concluida:', { jobId, total: job.total, inseridos: job.inseridos });
}

// processa um lote de linhas dentro de uma transação do banco
async function processarLote(job, lote, offsetInicial) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < lote.length; i++) {
      const linha    = normalizarLinhaImportada(lote[i]);
      const numLinha = offsetInicial + i + 2;

      logDiagnosticoCpf(lote[i].cpf, linha.cpf, numLinha);

      // validações básicas antes de tentar inserir
      if (!linha.nome || !linha.nome.trim()) {
        job.erros.push({ linha: numLinha, erro: 'Nome e obrigatorio.' });
        continue;
      }
      if (linha.cpf && !cpfValido(linha.cpf)) {
        job.erros.push({ linha: numLinha, erro: 'CPF invalido.' });
        continue;
      }
      if (linha.email && !emailValido(linha.email)) {
        job.erros.push({ linha: numLinha, erro: 'E-mail invalido.' });
        continue;
      }

      try {
        await client.query('SAVEPOINT linha_importacao');
        const r = await client.query(
          `INSERT INTO eleitores (
             campanha_id, cadastrado_por, nome, cpf, titulo_eleitor, data_nascimento,
             telefone, whatsapp, email, endereco, bairro, cidade, uf, cep,
             zona_eleitoral, secao_eleitoral, observacoes, status_voto
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'nao_identificado')
           ON CONFLICT (campanha_id, cpf) WHERE cpf IS NOT NULL DO NOTHING`,
          [
            job.campanha_id, job.usuario_id,
            linha.nome.trim(), normalizarCpf(linha.cpf),
            linha.titulo_eleitor  || null, linha.data_nascimento || null,
            linha.telefone        || null, linha.whatsapp        || null,
            linha.email ? linha.email.toLowerCase().trim() : null,
            linha.endereco        || null, linha.bairro          || null,
            linha.cidade          || null,
            linha.uf ? linha.uf.toUpperCase().slice(0, 2) : null,
            linha.cep             || null,
            linha.zona_eleitoral  ? parseInt(linha.zona_eleitoral,  10) || null : null,
            linha.secao_eleitoral ? parseInt(linha.secao_eleitoral, 10) || null : null,
            linha.observacoes     || null,
          ]
        );
        await client.query('RELEASE SAVEPOINT linha_importacao');
        // rowCount 0 = CPF duplicado, não inserido
        if (r.rowCount === 0) job.duplicados++;
        else job.inseridos++;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT linha_importacao');
        await client.query('RELEASE SAVEPOINT linha_importacao');
        job.erros.push({ linha: numLinha, erro: 'Dados invalidos nesta linha.' });
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(function () {});
    throw err;
  } finally {
    client.release();
  }
}

function normalizarLinhaImportada(linha) {
  return {
    nome: limparTexto(linha.nome, 255),
    cpf: normalizarCpfPlanilha(linha.cpf),
    titulo_eleitor: limparTexto(linha.titulo_eleitor, 20),
    data_nascimento: limparTexto(linha.data_nascimento, 10),
    telefone: limparTexto(linha.telefone, 20),
    whatsapp: limparTexto(linha.whatsapp, 20),
    email: normalizarEmail(linha.email),
    endereco: limparTexto(linha.endereco, 255),
    bairro: limparTexto(linha.bairro, 150),
    cidade: limparTexto(linha.cidade, 150),
    uf: limparTexto(linha.uf, 2),
    cep: limparTexto(linha.cep, 10),
    zona_eleitoral: limparTexto(linha.zona_eleitoral, 5),
    secao_eleitoral: limparTexto(linha.secao_eleitoral, 5),
    observacoes: limparTexto(linha.observacoes, 2000),
  };
}

// lê o arquivo (CSV ou Excel) e retorna um array de objetos com os campos mapeados
async function lerArquivo(entrada, nomeOriginal, mapeamento) {
  const extensao = path.extname(nomeOriginal || '').toLowerCase();

  // --- CSV ---
  if (extensao === '.csv') {
    const fonte = Buffer.isBuffer(entrada)
      ? require('stream').Readable.from(entrada)
      : fs.createReadStream(entrada);

    return new Promise(function (resolve, reject) {
      const linhas = [];
      const parser = parse({
        columns: function(cabecalhos) {
          if (cabecalhos.length > MAX_COLUNAS) {
            throw new Error('limite de colunas excedido');
          }
          return cabecalhos;
        },
        skip_empty_lines: true,
        trim: true,
        bom: true,
        max_record_size: MAX_TAMANHO_REGISTRO_CSV,
      });
      fonte.pipe(parser)
        .on('data', function (row) {
          if (linhas.length >= MAX_LINHAS) {
            parser.destroy(new Error('limite de linhas excedido'));
            return;
          }
          const linha = {};
          Object.keys(mapeamento).forEach(function (col) {
            if (mapeamento[col]) linha[mapeamento[col]] = buscarValorColuna(row, col);
          });
          linhas.push(linha);
        })
        .on('end',   function () { resolve(linhas); })
        .on('error', reject);
    });
  }

  // --- Excel (.xlsx) ---
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(entrada)) {
    await wb.xlsx.load(entrada);
  } else {
    await wb.xlsx.readFile(entrada);
  }

  const aba = wb.worksheets[0];
  if (!aba) return [];

  // encontra a primeira linha com 2+ células não-fórmula (cabeçalho)
  let cabecalho    = null;
  let numLinhasCab = 0;
  aba.eachRow(function (row, rn) {
    if (cabecalho) return;
    const celulas = [];
    let totalPreenchidas = 0;
    row.eachCell({ includeEmpty: false }, function (cell, numeroColuna) {
      const v = cell.value;
      if (v && typeof v === 'object' && v.formula) return;
      if (String(v || '').trim()) {
        // Mantem a posicao real da coluna, inclusive quando existem colunas vazias antes do cabecalho.
        celulas[numeroColuna - 1] = String(v).trim();
        totalPreenchidas += 1;
      }
    });
    if (totalPreenchidas >= 2) {
      cabecalho    = celulas;
      numLinhasCab = rn;
    }
  });
  if (!cabecalho) return [];

  const linhas = [];
  aba.eachRow(function (row, rn) {
    if (rn <= numLinhasCab || linhas.length > MAX_LINHAS) return;
    const obj = {};
    row.eachCell({ includeEmpty: false }, function (cell, col) {
      const chave = cabecalho[col - 1];
      if (!chave) return;
      let v = cell.value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      if (v && typeof v === 'object' && v.formula) v = null;
      if (v instanceof Date) v = v.toLocaleDateString('pt-BR');
      if (buscarCampoMapeado(mapeamento, chave) === 'cpf' && v !== null && v !== undefined) {
        const valorOriginal = v;
        const textoExibido = String(cell.text || '').trim();
        const textoTemOnzeDigitos = textoExibido.replace(/\D/g, '').length === 11;
        v = normalizarCpfPlanilha(
          textoTemOnzeDigitos ? textoExibido : valorOriginal,
          typeof valorOriginal === 'number'
        );
        logDiagnosticoCpf(valorOriginal, v, rn);
      }
      obj[chave] = v != null ? String(v).trim() : null;
    });

    // monta o objeto linha com os campos do mapeamento
    const linha = {};
    Object.keys(mapeamento).forEach(function (col) {
      if (mapeamento[col]) linha[mapeamento[col]] = buscarValorColuna(obj, col);
    });
    if (Object.values(linha).some(function (v) { return v; })) {
      linhas.push(linha);
    }
  });
  if (linhas.length > MAX_LINHAS) {
    throw new Error('limite de linhas excedido');
  }
  return linhas;
}

// GET /api/voters/import/:jobId — consulta o status de um job de importação
async function consultarStatusImport(req, res, next) {
  if (!uuidValido(req.params.jobId)) {
    return res.status(400).json({ erro: 'Identificador de importacao invalido.' });
  }
  let job = jobs.get(req.params.jobId);
  if (!job) {
    try {
      const resultado = await require('../config/db').query(
        `SELECT id,campanha_id,usuario_id,status,progresso AS progress,total,inseridos,
         duplicados,erros,erro_fatal,concluido_em FROM jobs_importacao WHERE id=$1`,
        [req.params.jobId]
      );
      job = resultado.rows[0];
    } catch (erro) {
      if (erro.code !== '42P01') return next(erro);
    }
  }
  if (!job) return res.status(404).json({ erro: 'Job nao encontrado.' });
  const podeConsultar = job.usuario_id === req.usuario.id || temAcessoAmplo(req.usuario);
  if (job.campanha_id !== req.usuario.campanha_id || !podeConsultar) {
    return res.status(403).json({ erro: 'Acesso negado.' });
  }
  return res.status(200).json({
    jobId:        job.id,
    status:       job.status,
    progress:     job.progress,
    total:        job.total,
    inseridos:    job.inseridos,
    duplicados:   job.duplicados,
    erros:        job.erros.slice(0, 100),
    total_erros:  job.erros.length,
    concluido_em: job.concluido_em || null,
    erro_fatal:   job.erro_fatal   || null,
  });
}

async function retomarImportacoesPendentes() {
  let resultado;
  try {
    resultado = await require('../config/db').query(
      `SELECT id,campanha_id,usuario_id,nome_arquivo,mapeamento,arquivo_dados,ip_origem,
       processadas,total,inseridos,duplicados,erros
       FROM jobs_importacao WHERE status IN ('aguardando','processando') AND arquivo_dados IS NOT NULL
       ORDER BY criado_em ASC LIMIT 20`
    );
  } catch (erro) {
    if (erro.code === '42P01') return;
    throw erro;
  }
  for (const linha of resultado.rows) {
    const job = {
      id: linha.id, campanha_id: linha.campanha_id, usuario_id: linha.usuario_id,
      status: 'aguardando', progress: 0, total: linha.total, processadas: linha.processadas,
      inseridos: linha.inseridos, duplicados: linha.duplicados,
      erros: linha.erros || [], arquivo: null, buffer: linha.arquivo_dados,
      nomeOriginal: linha.nome_arquivo, mapeamento: linha.mapeamento,
      criado_em: new Date().toISOString(), ip_origem: linha.ip_origem,
    };
    jobs.set(job.id, job);
    setImmediate(function() {
      processarArquivoBackground(job.id).catch(async function() {
        job.status = 'erro';
        job.erro_fatal = 'A importacao nao pode ser retomada.';
        await persistirJob(job).catch(function() {});
      });
    });
  }
}

module.exports = { importarPlanilha, consultarStatusImport, lerArquivo, retomarImportacoesPendentes };
