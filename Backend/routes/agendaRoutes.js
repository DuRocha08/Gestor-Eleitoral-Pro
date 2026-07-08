const { Router } = require('express');
const { listar, criar, atualizar } = require('../controllers/agendaController');
const { autenticar } = require('../middlewares/authMiddleware');

const router = Router();
router.use(autenticar);
router.get('/', listar);
router.post('/', criar);
router.put('/:id', atualizar);

module.exports = router;
