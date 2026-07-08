const { Router } = require('express');
const {
  listar, dashboard, criar, atualizar, historico, adicionarHistorico,
} = require('../controllers/supporterController');
const { autenticar } = require('../middlewares/authMiddleware');

const router = Router();
router.use(autenticar);
router.get('/', listar);
router.get('/dashboard', dashboard);
router.post('/', criar);
router.put('/:id', atualizar);
router.get('/:id/historico', historico);
router.post('/:id/historico', adicionarHistorico);

module.exports = router;
