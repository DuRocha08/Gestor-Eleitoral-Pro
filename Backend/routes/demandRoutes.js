// rotas de demandas da ouvidoria — todas protegidas por JWT
const { Router } = require('express');
const {
  listar,
  buscarPorId,
  criar,
  atualizarStatus,
  atualizarPrioridade,
  atualizar,
} = require('../controllers/demandController');
const { autenticar } = require('../middlewares/authMiddleware');
const { uuidValido } = require('../utils/validacao');

const router = Router();

function validarId(req, res, next) {
  if (!uuidValido(req.params.id)) {
    return res.status(400).json({ erro: 'Identificador invalido.' });
  }
  next();
}

// aplico o autenticar em todas as rotas de uma vez
router.use(autenticar);

router.get('/', listar);
router.get('/:id', validarId, buscarPorId);
router.post('/', criar);
router.patch('/:id/status', validarId, atualizarStatus);
router.patch('/:id/priority', validarId, atualizarPrioridade);
router.put('/:id', validarId, atualizar);

module.exports = router;
