const { Router } = require('express');
const { listar } = require('../controllers/auditController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');

const router = Router();
router.use(autenticar, autorizarNivelMinimo('coordenador'));
router.get('/', listar);
module.exports = router;
