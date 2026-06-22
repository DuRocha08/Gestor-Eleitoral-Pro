const { Router } = require('express');
const { listar, atualizar, remover } = require('../controllers/teamController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');

const router = Router();
router.use(autenticar, autorizarNivelMinimo('coordenador'));
router.get('/', listar);
router.patch('/:id', atualizar);
router.delete('/:id', remover);
module.exports = router;
