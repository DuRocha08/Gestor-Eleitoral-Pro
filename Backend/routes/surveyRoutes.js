const { Router } = require('express');
const {
  listarQuestionarios,
  criarQuestionario,
  buscarQuestionarioPublico,
  salvarRespostaPublica,
  salvarResposta,
  estatisticas,
  criarOrigem,
  listarOrigens,
} = require('../controllers/surveyController');
const { autenticar } = require('../middlewares/authMiddleware');
const { limiterCadastro } = require('../middlewares/rateLimiter');

const router = Router();

router.get('/public/:slug', buscarQuestionarioPublico);
router.post('/public/:slug/respostas', limiterCadastro, salvarRespostaPublica);

router.use(autenticar);
router.get('/questionarios', listarQuestionarios);
router.post('/questionarios', criarQuestionario);
router.post('/questionarios/:id/respostas', salvarResposta);
router.get('/questionarios/:id/estatisticas', estatisticas);
router.get('/questionarios/:id/origens', listarOrigens);
router.post('/questionarios/:id/origens', criarOrigem);

module.exports = router;
