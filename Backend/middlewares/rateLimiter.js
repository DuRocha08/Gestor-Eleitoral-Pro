// limita requisicoes por IP pra evitar abuso da API
const rateLimit = require('express-rate-limit');

// limite geral pra todas as rotas da API
const limiterApi = rateLimit({
  windowMs: 15 * 60 * 1000, // janela de 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisicoes. Tente novamente em alguns minutos.' },
});

// limite mais restrito pra importacao de planilhas
// evita que alguem fique mandando arquivo grande em loop
const limiterImport = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Limite de importacoes atingido. Aguarde uma hora.' },
});

function criarLimiterAuth() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // Em desenvolvimento o limite maior evita bloqueios durante os testes locais.
    max: process.env.NODE_ENV === 'production' ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: function(req, res, _next, options) {
      const resetTime = req.rateLimit && req.rateLimit.resetTime;
      const segundos = resetTime instanceof Date
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : 15 * 60;

      return res.status(options.statusCode).json({
        erro: 'Muitas tentativas. Aguarde antes de tentar novamente.',
        tentar_novamente_em_segundos: segundos,
      });
    },
  });
}

// Login e cadastro usam contadores separados para uma rota nao bloquear a outra.
const limiterLogin = criarLimiterAuth();
const limiterCadastro = criarLimiterAuth();

// Limites separados reduzem abuso e custos da integracao externa.
const limiterWhatsappIndividual = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function(req) { return 'usuario:' + req.usuario.id; },
  message: { erro: 'Limite de mensagens individuais atingido. Aguarde uma hora.' },
});

const limiterWhatsappBulk = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function(req) { return 'usuario:' + req.usuario.id; },
  message: { erro: 'Limite de disparos em massa atingido. Aguarde uma hora.' },
});

module.exports = {
  limiterApi,
  limiterImport,
  limiterLogin,
  limiterCadastro,
  limiterWhatsappIndividual,
  limiterWhatsappBulk,
};
