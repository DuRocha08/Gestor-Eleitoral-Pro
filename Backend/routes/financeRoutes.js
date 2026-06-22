// rotas financeiras — só coordenador e admin têm acesso
const { Router } = require('express');
const { obterSaldo, listar } = require('../controllers/financeController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');

const router = Router();

router.use(autenticar);
router.use(autorizarNivelMinimo('coordenador'));

router.get('/balance', obterSaldo);
router.get('/', listar);

module.exports = router;
