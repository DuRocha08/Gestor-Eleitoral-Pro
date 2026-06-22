const { Router } = require('express');
const { metricas } = require('../controllers/monitoringController');
const { autenticar, autorizarNivelMinimo } = require('../middlewares/authMiddleware');
const router = Router();
router.get('/metrics', autenticar, autorizarNivelMinimo('coordenador'), metricas);
module.exports = router;
