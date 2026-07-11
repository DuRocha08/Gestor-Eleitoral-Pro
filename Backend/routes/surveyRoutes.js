const { Router } = require('express');
const {
  listarQuestionarios,
  criarQuestionario,
  atualizarQuestionario,
  excluirQuestionario,
  buscarQuestionarioPublico,
  salvarRespostaPublica,
  salvarResposta,
  estatisticas,
  listarRespostas,
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
router.put('/questionarios/:id', atualizarQuestionario);
router.delete('/questionarios/:id', excluirQuestionario);
router.post('/questionarios/:id/respostas', salvarResposta);
router.get('/questionarios/:id/estatisticas', estatisticas);
router.get('/questionarios/:id/respostas', listarRespostas);
router.get('/questionarios/:id/origens', listarOrigens);
router.post('/questionarios/:id/origens', criarOrigem);

module.exports = router;
