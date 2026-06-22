const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const { detectarTipoPlanilha, ASSINATURAS } = require('../middlewares/detectarPlanilha');
const { detectarTipoPlanilhaEleitoral } = require('../middlewares/leitorPlanilhasEleitorais');
const { autenticar, autorizarNivelMinimo, temAcessoAmplo } = require('../middlewares/authMiddleware');
const { query } = require('../config/db');
const { limparNomeArquivo, validarArquivoXlsx } = require('../utils/arquivo');
const { registrar, ACOES } = require('../utils/auditoria');
const { salvarPlanilhaEspecial } = require('../services/planilhaService');

const router = express.Router();

function logDesenvolvimento(...argumentos) {
  if (process.env.NODE_ENV !== 'production') console.info(...argumentos);
}

const uploadMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      return cb(new Error('Apenas arquivos .xlsx são aceitos.'), false);
    }
    cb(null, true);
  },
});

const limiteUpload = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { erro: 'Muitas tentativas. Aguarde 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function validarMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4B &&
         buffer[2] === 0x03 && buffer[3] === 0x04;
}

// POST /api/planilha/detectar
router.post(
  '/detectar',
  autenticar,
  limiteUpload,
  uploadMemoria.single('planilha'),
  async function (req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ erro: 'Nenhum arquivo recebido.', tipo: null, todasAbas: [] });
      }

      const buffer = req.file.buffer;

      if (!validarMagicBytes(buffer)) {
        return res.status(422).json({ erro: 'Conteúdo inválido.', tipo: null, todasAbas: [] });
      }

      validarArquivoXlsx(buffer);

      const nomeArquivo = limparNomeArquivo(req.file.originalname);
      const deteccao = await detectarTipoPlanilha(buffer, nomeArquivo);

      logDesenvolvimento(
        `[planilhaRoutes] Detecção: tamanho=${req.file.size}B, ` +
        `tipo=${deteccao.tipo || 'NÃO IDENTIFICADO'}, pontuacao=${deteccao.pontuacao}%`
      );

      const statusCode = 200; // frontend decide o que fazer quando tipo é null
      return res.status(statusCode).json({
        ...deteccao,
        arquivo: { nome: nomeArquivo, tamanho_bytes: req.file.size },
      });

    } catch (err) {
      if (err.status === 422) {
        return res.status(422).json({ erro: err.message, tipo: null, todasAbas: [] });
      }
      console.error('[planilhaRoutes] Erro inesperado:', process.env.NODE_ENV === 'production' ? (err.code || err.name) : err.message);
      return res.status(500).json({ erro: 'Erro interno ao processar o arquivo.', tipo: null, todasAbas: [] });
    }
  }
);

// Salva os dados reconhecidos da planilha como JSONB.
router.post(
  '/importar',
  autenticar,
  autorizarNivelMinimo('operador'),
  limiteUpload,
  uploadMemoria.single('planilha'),
  async function (req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ erro: 'Nenhum arquivo recebido.' });
      }

      if (!validarMagicBytes(req.file.buffer)) {
        return res.status(422).json({ erro: 'Arquivo inválido.' });
      }

      validarArquivoXlsx(req.file.buffer);

      let dados;
      try {
        dados = await detectarTipoPlanilhaEleitoral(req.file.buffer);
      } catch (_) {
        return res.status(422).json({ erro: 'Nao foi possivel ler ou reconhecer a planilha.' });
      }

      const tipo        = dados.tipo;
      const campanhaId  = req.usuario.campanha_id;
      const usuarioId   = req.usuario.id;
      const nomeArquivo = limparNomeArquivo(req.file.originalname);

      if (tipo === 'financeiro' && !temAcessoAmplo(req.usuario)) {
        return res.status(403).json({ erro: 'Apenas coordenador ou admin podem importar dados financeiros.' });
      }

      const resultado = await salvarPlanilhaEspecial({
        tipo,
        dados,
        campanhaId,
        usuarioId,
        nomeArquivo,
      });

      logDesenvolvimento('[planilhaRoutes] Importação concluída:', resultado.tipo);
      await registrar({
        campanha_id: campanhaId,
        usuario_id: usuarioId,
        acao: ACOES.IMPORT_CONCLUIDO,
        entidade: 'importacao',
        entidade_id: resultado.id,
        ip: req.ip,
        antes: null,
        depois: { tipo: resultado.tipo, arquivo: nomeArquivo },
      });
      return res.status(201).json(resultado);

    } catch (err) {
      if (err.status === 413 || err.status === 422) {
        return res.status(err.status).json({ erro: err.message });
      }
      console.error('[planilhaRoutes] Erro ao importar:', process.env.NODE_ENV === 'production' ? (err.code || err.name) : err.message);
      return res.status(500).json({ erro: 'Erro interno ao importar planilha.' });
    }
  }
);

// GET /api/planilha/tipos
router.get('/tipos', autenticar, function (req, res) {
  return res.json({
    tipos: Object.entries(ASSINATURAS).map(([tipo, colunas]) => ({
      tipo,
      label: { PLANO_CAMPANHA: 'Plano de Campanha', PESQUISA_VOTO: 'Pesquisa de Intenção de Voto', FINANCEIRO: 'Financeiro Eleitoral (TSE)' }[tipo] || tipo,
      colunas_esperadas: colunas,
    })),
  });
});

router.use(function (err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo muito grande. Limite: 10MB.' });
    return res.status(400).json({ erro: 'Erro no upload da planilha.' });
  }
  if (err && err.message) return res.status(400).json({ erro: 'Arquivo invalido ou fora do padrao esperado.' });
  next(err);
});

const CAMPOS_PLANO = `
  id, campanha_id, importado_por, arquivo_nome, configuracao,
  cronograma, metas, created_at
`;

const CAMPOS_PESQUISA = `
  id, campanha_id, importado_por, arquivo_nome, entrevistas,
  por_candidato, por_tema, created_at
`;

const CAMPOS_FINANCEIRO_IMPORTADO = `
  id, campanha_id, importado_por, arquivo_nome, receitas,
  despesas, prestacao, created_at
`;

// GET /api/planilha/campanha/ultimo
router.get('/campanha/ultimo', autenticar, async function (req, res) {
  try {
    const r = await query(
      `SELECT ${CAMPOS_PLANO}
       FROM planos_campanha
       WHERE campanha_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.usuario.campanha_id]
    );
    if (!r.rows[0]) return res.status(404).json({ erro: 'Nenhum plano importado ainda.' });
    return res.json(r.rows[0]);
  } catch (err) { return res.status(500).json({ erro: 'Erro ao buscar plano importado.' }); }
});

// GET /api/planilha/pesquisa/ultimo
router.get('/pesquisa/ultimo', autenticar, async function (req, res) {
  try {
    const r = await query(
      `SELECT ${CAMPOS_PESQUISA}
       FROM pesquisas_voto
       WHERE campanha_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.usuario.campanha_id]
    );
    if (!r.rows[0]) return res.status(404).json({ erro: 'Nenhuma pesquisa importada ainda.' });
    return res.json(r.rows[0]);
  } catch (err) { return res.status(500).json({ erro: 'Erro ao buscar pesquisa importada.' }); }
});

// GET /api/planilha/financeiro/ultimo
router.get('/financeiro/ultimo', autenticar, autorizarNivelMinimo('coordenador'), async function (req, res) {
  try {
    const r = await query(
      `SELECT ${CAMPOS_FINANCEIRO_IMPORTADO}
       FROM importacoes_financeiro
       WHERE campanha_id=$1
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.usuario.campanha_id]
    );
    if (!r.rows[0]) return res.status(404).json({ erro: 'Nenhum financeiro importado ainda.' });
    return res.json(r.rows[0]);
  } catch (err) { return res.status(500).json({ erro: 'Erro ao buscar financeiro importado.' }); }
});
module.exports = router;
