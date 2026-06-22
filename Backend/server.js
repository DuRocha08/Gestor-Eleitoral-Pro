// Arquivo principal da API: configuracao do Express, seguranca e rotas.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { query, testarConexao, encerrarPool } = require('./config/db');
const { limiterApi } = require('./middlewares/rateLimiter');

const authRoutes        = require('./routes/authRoutes');
const voterRoutes       = require('./routes/voterRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const demandRoutes      = require('./routes/demandRoutes');
const financeRoutes     = require('./routes/financeRoutes');
const planilhaRoutes    = require('./routes/planilhaRoutes');
const teamRoutes        = require('./routes/teamRoutes');
const auditRoutes       = require('./routes/auditRoutes');
const { retomarImportacoesPendentes } = require('./controllers/importController');
const monitoringRoutes  = require('./routes/monitoringRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');
const { enviarAlertaErro } = require('./services/alertService');

const app = express();
const PORTA = process.env.PORT || 3001;

function carregarOrigensPermitidas() {
  const origens = new Set();
  if (process.env.NODE_ENV !== 'production') {
    origens.add('http://localhost:5173');
    origens.add('http://localhost:3000');
  }

  const configuradas = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(function(origem) { return origem.trim(); })
    .filter(Boolean);

  configuradas.forEach(function(origem) {
    let url;
    try {
      url = new URL(origem);
    } catch (_) {
      throw new Error('CORS_ORIGINS contem uma origem invalida.');
    }
    if (url.origin !== origem || url.username || url.password ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('CORS_ORIGINS deve conter somente origens HTTPS, sem caminho ou credenciais.');
    }
    origens.add(url.origin);
  });
  return origens;
}

const origensPermitidas = carregarOrigensPermitidas();

function validarConfiguracao() {
  const usaUrlBanco = Boolean(process.env.DATABASE_URL);
  const obrigatorias = usaUrlBanco
    ? ['JWT_SECRET']
    : ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET'];
  const faltando = obrigatorias.filter(function(nome) {
    return !process.env[nome];
  });

  if (faltando.length > 0) {
    throw new Error('Variaveis obrigatorias ausentes: ' + faltando.join(', '));
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 64) {
    throw new Error('JWT_SECRET deve ter pelo menos 64 caracteres em producao.');
  }
  const segredoMinusculo = process.env.JWT_SECRET.toLowerCase();
  const caracteresDistintos = new Set(process.env.JWT_SECRET).size;
  if (/troque|coloque|preencha|gere_uma_chave/.test(segredoMinusculo) || caracteresDistintos < 16) {
    throw new Error('JWT_SECRET deve ser aleatorio e nao pode usar o valor de exemplo.');
  }
  const expiracaoJwt = Number(process.env.JWT_EXPIRES_IN || 3600);
  if (!Number.isInteger(expiracaoJwt) || expiracaoJwt < 300 ||
      (process.env.NODE_ENV === 'production' && expiracaoJwt > 3600)) {
    throw new Error('JWT_EXPIRES_IN deve ficar entre 300 e 3600 segundos em producao.');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS deve ser configurado em producao.');
  }
  if (process.env.NODE_ENV === 'production' &&
      (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.length < 64 ||
       process.env.MFA_ENCRYPTION_KEY === process.env.JWT_SECRET)) {
    throw new Error('MFA_ENCRYPTION_KEY deve ser aleatoria, ter 64 caracteres e ser diferente do JWT_SECRET.');
  }
  const configuracoesEmail = [process.env.RESEND_API_KEY, process.env.PASSWORD_RESET_FROM, process.env.FRONTEND_URL];
  if (process.env.NODE_ENV === 'production' && !configuracoesEmail.every(Boolean)) {
    throw new Error('Recuperacao de senha exige RESEND_API_KEY, PASSWORD_RESET_FROM e FRONTEND_URL em producao.');
  }
  if (configuracoesEmail.some(Boolean) && !configuracoesEmail.every(Boolean)) {
    throw new Error('Configure RESEND_API_KEY, PASSWORD_RESET_FROM e FRONTEND_URL em conjunto.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL) {
    const frontend = new URL(process.env.FRONTEND_URL);
    if (frontend.protocol !== 'https:' || frontend.username || frontend.password) {
      throw new Error('FRONTEND_URL deve usar HTTPS e nao conter credenciais.');
    }
  }
  if (process.env.NODE_ENV === 'production' && usaUrlBanco) {
    let urlBanco;
    try {
      urlBanco = new URL(process.env.DATABASE_URL);
    } catch (_) {
      throw new Error('DATABASE_URL deve ser uma URL PostgreSQL valida.');
    }
    if (!['postgres:', 'postgresql:'].includes(urlBanco.protocol) || !urlBanco.hostname ||
        !urlBanco.username || !urlBanco.password || urlBanco.password.length < 16) {
      throw new Error('DATABASE_URL de producao possui formato ou credenciais fracas.');
    }
  }
  if (process.env.NODE_ENV === 'production' && !usaUrlBanco && process.env.DB_PASSWORD.length < 16) {
    throw new Error('DB_PASSWORD deve ter pelo menos 16 caracteres em producao.');
  }
  if (!['true', 'false'].includes(String(process.env.TRUST_PROXY || 'false'))) {
    throw new Error('TRUST_PROXY deve ser definido como true ou false.');
  }
  if (process.env.NODE_ENV === 'production' && !['true', 'false'].includes(process.env.ALLOW_PUBLIC_REGISTRATION)) {
    throw new Error('ALLOW_PUBLIC_REGISTRATION deve ser definido como true ou false em producao.');
  }
  if (process.env.WHATSAPP_SIMULATION_MODE === 'false' && !process.env.EVOLUTION_API_KEY) {
    throw new Error('EVOLUTION_API_KEY e obrigatoria quando a simulacao do WhatsApp esta desativada.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.WHATSAPP_SIMULATION_MODE === 'false' &&
      process.env.EVOLUTION_API_KEY.length < 20) {
    throw new Error('EVOLUTION_API_KEY deve ter pelo menos 20 caracteres em producao.');
  }
  if (process.env.WHATSAPP_SIMULATION_MODE === 'false' &&
      !/^[A-Za-z0-9_-]{1,100}$/.test(process.env.EVOLUTION_API_INSTANCE || '')) {
    throw new Error('EVOLUTION_API_INSTANCE deve conter apenas letras, numeros, hifen e sublinhado.');
  }
  if (process.env.NODE_ENV === 'production' && process.env.WHATSAPP_SIMULATION_MODE === 'false') {
    let urlEvolution;
    try {
      urlEvolution = new URL(process.env.EVOLUTION_API_URL);
    } catch (_) {
      throw new Error('EVOLUTION_API_URL deve ser uma URL valida em producao.');
    }
    if (urlEvolution.protocol !== 'https:' || urlEvolution.username || urlEvolution.password) {
      throw new Error('EVOLUTION_API_URL deve usar HTTPS e nao pode conter credenciais.');
    }
  }
}

function erroSeguro(err, status) {
  if (status >= 500 || process.env.NODE_ENV === 'production') {
    return 'Erro interno do servidor';
  }
  return err.message || 'Erro interno do servidor';
}

const configuracaoCors = {
  origin: function(origem, callback) {
    if (!origem || origensPermitidas.has(origem)) {
      return callback(null, true);
    }
    const erro = new Error('Origem nao permitida pelo CORS.');
    erro.status = 403;
    return callback(erro);
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'", ...Array.from(origensPermitidas)],
    },
  } : false,
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
  crossOriginResourcePolicy: false,
}));

app.use(cors(configuracaoCors));
app.options('*', cors(configuracaoCors));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(function(req, res, next) {
  const idRequisicao = crypto.randomUUID();
  req.idRequisicao = idRequisicao;
  res.setHeader('X-Request-Id', idRequisicao);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use('/api', limiterApi);

app.use('/api/auth',         authRoutes);
app.use('/api/voters',       voterRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/demands',      demandRoutes);
app.use('/api/finance',      financeRoutes);
app.use('/api/planilha',     planilhaRoutes);
app.use('/api/team',          teamRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/monitoring',    monitoringRoutes);
app.use('/api/platform-admin', platformAdminRoutes);

// O provedor usa esta rota para saber se a API e o banco estao disponiveis.
app.get('/api/health', async function(req, res) {
  try {
    await query('SELECT 1');
    res.status(200).json({
      status:    'online',
      banco:     'online',
      servico:   'Gestor Eleitoral API',
      versao:    '1.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (_) {
    res.status(503).json({
      status: 'indisponivel',
      banco: 'offline',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use(function(req, res) {
  res.status(404).json({ erro: 'Rota nao encontrada' });
});

// O Express identifica o tratador global pela assinatura com quatro parametros.
app.use(function(err, req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ erro: 'Arquivo muito grande. Limite: 10MB.' });
  }
  if (err.message && err.message.includes('Tipo de arquivo nao permitido')) {
    return res.status(422).json({ erro: err.message });
  }
  const identificador = req.idRequisicao || crypto.randomUUID();
  if (process.env.NODE_ENV === 'production') {
    console.error('[ERRO]', identificador, err.code || err.name || 'erro_interno');
  } else {
    console.error('[ERRO]', identificador, err.message);
  }
  enviarAlertaErro({ requestId: identificador, codigo: err.code || err.name, rota: req.path }).catch(function() {});
  const statusInformado = Number(err.status || err.statusCode);
  const status = Number.isInteger(statusInformado) && statusInformado >= 400 && statusInformado <= 599
    ? statusInformado
    : 500;
  res.status(status).json({
    erro: erroSeguro(err, status),
    identificador,
  });
});

async function iniciarServidor() {
  validarConfiguracao();
  const bancoOk = await testarConexao();

  if (!bancoOk) {
    console.error('[SERVIDOR] banco inacessivel, encerrando...');
    process.exit(1);
  }

  await retomarImportacoesPendentes();

  const servidor = app.listen(PORTA, function() {
    console.log('[SERVIDOR] rodando na porta ' + PORTA);
  });

  servidor.on('error', function(err) {
    if (err.code === 'EADDRINUSE') {
      console.error('[SERVIDOR] a porta ' + PORTA + ' ja esta em uso. Encerre a outra instancia do backend.');
    } else {
      console.error('[SERVIDOR] nao foi possivel iniciar:', err.code || err.message);
    }
    encerrarPool().catch(function() {}).finally(function() { process.exit(1); });
  });

  // Limita conexoes lentas e sockets mantidos indefinidamente.
  servidor.headersTimeout = 15000;
  servidor.requestTimeout = 30000;
  servidor.keepAliveTimeout = 5000;
  servidor.maxRequestsPerSocket = 1000;

  let encerrando = false;
  async function encerrar(sinal) {
    if (encerrando) return;
    encerrando = true;
    console.log('[SERVIDOR] encerramento solicitado por ' + sinal);
    servidor.close(async function() {
      await encerrarPool().catch(function() {});
      process.exit(0);
    });
    setTimeout(function() { process.exit(1); }, 10000).unref();
  }

  process.once('SIGTERM', function() { encerrar('SIGTERM'); });
  process.once('SIGINT', function() { encerrar('SIGINT'); });
}

iniciarServidor().catch(function(err) {
  console.error('[SERVIDOR] erro ao iniciar:', err?.message || err);
  process.exit(1);
});
