// rotas financeiras — só coordenador e admin têm acesso
const { Router } = require('express');
const {
  obterSaldo,
  listar,
  listarCategorias,
  criarCategoria,
  criar,
  relatorioMensal,
  fluxoCaixa,
  salvarLimite,
  obterLimite,
} = require('../controllers/financeController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');

const router = Router();

router.use(autenticar);
router.use(autorizarNivelMinimo('coordenador'));

router.get('/balance', obterSaldo);
router.get('/categories', listarCategorias);
router.post('/categories', criarCategoria);
router.get('/reports/monthly', relatorioMensal);
router.get('/cash-flow', fluxoCaixa);
router.get('/spending-limit', obterLimite);
router.post('/spending-limit', salvarLimite);
router.get('/', listar);
router.post('/', criar);

module.exports = router;
