const { Router } = require('express');
const {
  listar,
  buscarPorId,
  criar,
  atualizar,
  excluir,
} = require('../controllers/voterController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');
const { regrasEleitor, verificarValidacao } = require('../middlewares/validarEleitor');
const { uuidValido } = require('../utils/validacao');
const { limiterImport } = require('../middlewares/rateLimiter');
const { importarPlanilha, consultarStatusImport } = require('../controllers/importController');

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const DIR_TEMP = path.join(os.tmpdir(), 'gestor-eleitoral-imports');
if (!fs.existsSync(DIR_TEMP)) {
  fs.mkdirSync(DIR_TEMP, { recursive: true, mode: 0o700 });
}
try {
  fs.chmodSync(DIR_TEMP, 0o700);
} catch (_) {
  // O Windows nao aplica permissoes POSIX; o diretorio continua fora da pasta publica.
}

// Remove apenas temporarios antigos criados por esta aplicacao apos uma queda.
const LIMITE_TEMPORARIO_MS = 2 * 60 * 60 * 1000;
for (const entrada of fs.readdirSync(DIR_TEMP, { withFileTypes: true })) {
  if (!entrada.isFile() || !/^import_[a-f0-9]{32}\.(xlsx|csv)$/i.test(entrada.name)) continue;
  const caminho = path.join(DIR_TEMP, entrada.name);
  try {
    const info = fs.statSync(caminho);
    if (Date.now() - info.mtimeMs > LIMITE_TEMPORARIO_MS) fs.unlinkSync(caminho);
  } catch (_) {
    // Outro processo pode ter removido o arquivo entre a listagem e a limpeza.
  }
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, DIR_TEMP);
  },
  filename: function (req, file, cb) {
    // Evita colisão entre arquivos enviados ao mesmo tempo.
    const nomeSeguro = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'import_' + nomeSeguro + ext);
  },
});

const tiposPermitidos = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/octet-stream',
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, cb) {
    const extValida = /\.(xlsx|csv)$/i.test(file.originalname);
    if (!extValida || !tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo nao permitido. Envie .xlsx ou .csv.'));
    }
    cb(null, true);
  },
});

const router = Router();

function validarId(req, res, next) {
  if (!uuidValido(req.params.id)) {
    return res.status(400).json({ erro: 'Identificador invalido.' });
  }
  next();
}

router.use(autenticar);

router.get('/', listar);
router.get('/:id', validarId, buscarPorId);
router.post('/', regrasEleitor, verificarValidacao, criar);
router.put('/:id', validarId, regrasEleitor, verificarValidacao, atualizar);
router.delete('/:id', validarId, excluir);

router.post(
  '/import',
  autorizarNivelMinimo('operador'),
  limiterImport,
  upload.single('planilha'),
  importarPlanilha
);
router.get('/import/:jobId', consultarStatusImport);

module.exports = router;
