// rotas de integrações externas — WhatsApp e relatórios TSE
const { Router } = require('express');
const {
  enviarMensagemIndividual,
  enviarDisparoEmMassa,
  SIMULATION_MODE,
} = require('../services/whatsappService');
const {
  gerarRelatorioCampanha,
  gerarRelatorioZonaSecao,
} = require('../services/tseService');
const {
  autenticar,
  autorizarNivelMinimo,
} = require('../middlewares/authMiddleware');
const { query } = require('../config/db');
const { uuidValido } = require('../utils/validacao');
const {
  limiterWhatsappIndividual,
  limiterWhatsappBulk,
} = require('../middlewares/rateLimiter');

const router = Router();

async function vinculosPertencemCampanha(campanhaId, eleitorId, apoiadorId) {
  if (eleitorId) {
    if (!uuidValido(eleitorId)) return false;
    const eleitor = await query(
      'SELECT id FROM eleitores WHERE id = $1 AND campanha_id = $2',
      [eleitorId, campanhaId]
    );
    if (eleitor.rows.length === 0) return false;
  }

  if (apoiadorId) {
    if (!uuidValido(apoiadorId)) return false;
    const apoiador = await query(
      'SELECT id FROM apoiadores WHERE id = $1 AND campanha_id = $2',
      [apoiadorId, campanhaId]
    );
    if (apoiador.rows.length === 0) return false;
  }

  return true;
}

// todas as rotas de integração exigem login
router.use(autenticar);

// Envia uma mensagem para um numero especifico.
async function enviarIndividual(req, res, next) {
  try {
    const { telefone, texto, eleitor_id, apoiador_id } = req.body;

    if (!telefone) {
      return res.status(400).json({ erro: 'O campo telefone e obrigatorio.' });
    }

    if (!(await vinculosPertencemCampanha(req.usuario.campanha_id, eleitor_id, apoiador_id))) {
      return res.status(403).json({ erro: 'Eleitor ou apoiador nao pertence a esta campanha.' });
    }

    const resultado = await enviarMensagemIndividual(telefone, texto, {
      campanha_id: req.usuario.campanha_id,
      enviado_por: req.usuario.id,
      eleitor_id: eleitor_id || null,
      apoiador_id: apoiador_id || null,
    });

    return res.status(200).json({
      mensagem: 'Mensagem enviada com sucesso.',
      modo_simulacao: SIMULATION_MODE,
      ...resultado,
    });
  } catch (erro) {
    // o serviço joga erro com .status quando é erro de validação
    if (erro.status) {
      return res.status(erro.status).json({ erro: erro.message });
    }
    next(erro);
  }
}

// Envia a mesma mensagem para uma lista de numeros.
async function enviarEmMassa(req, res, next) {
  try {
    const { numeros, texto } = req.body;

    if (!texto || !String(texto).trim()) {
      return res.status(400).json({ erro: 'O campo texto e obrigatorio.' });
    }

    const resultado = await enviarDisparoEmMassa(numeros, texto, {
      campanha_id: req.usuario.campanha_id,
      enviado_por: req.usuario.id,
    });

    return res.status(200).json({
      mensagem: 'Disparo em massa concluido.',
      ...resultado,
    });
  } catch (erro) {
    if (erro.status) {
      return res.status(erro.status).json({ erro: erro.message });
    }
    next(erro);
  }
}

// Gera o relatorio completo da campanha com os dados do TSE.
async function relatorioCampanha(req, res, next) {
  try {
    const campanhaId = req.usuario.campanha_id;
    const relatorio = await gerarRelatorioCampanha(campanhaId, req.usuario.id);
    return res.status(200).json(relatorio);
  } catch (erro) {
    next(erro);
  }
}

// Gera o relatorio de uma zona e secao especifica.
async function relatorioZonaSecao(req, res, next) {
  try {
    const { zona, secao } = req.params;

    const zonaNumero = Number(zona);
    const secaoNumero = Number(secao);
    if (!Number.isInteger(zonaNumero) || !Number.isInteger(secaoNumero) ||
        zonaNumero < 1 || zonaNumero > 9999 || secaoNumero < 1 || secaoNumero > 9999) {
      return res.status(400).json({ erro: 'Zona e secao eleitoral devem ser numericas.' });
    }

    const campanhaId = req.usuario.campanha_id;
    const relatorio = await gerarRelatorioZonaSecao(campanhaId, zonaNumero, secaoNumero, req.usuario.id);
    return res.status(200).json(relatorio);
  } catch (erro) {
    next(erro);
  }
}

// rotas WhatsApp
router.post('/whatsapp/send', autorizarNivelMinimo('operador'), limiterWhatsappIndividual, enviarIndividual);
router.post('/whatsapp/bulk', autorizarNivelMinimo('operador'), limiterWhatsappBulk, enviarEmMassa);

// rotas TSE — exigem coordenador no mínimo
router.get('/tse/report', autorizarNivelMinimo('coordenador'), relatorioCampanha);
router.get('/tse/zona/:zona/secao/:secao', autorizarNivelMinimo('coordenador'), relatorioZonaSecao);

module.exports = router;
