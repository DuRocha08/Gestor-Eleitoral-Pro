const { Router } = require('express');
const { autenticar, autorizarAdministradorGlobal, exigirMfaAdministrador } = require('../middlewares/authMiddleware');
const controller = require('../controllers/platformAdminController');

const router = Router();
router.use(autenticar, autorizarAdministradorGlobal, exigirMfaAdministrador);
router.get('/summary', controller.resumo);
router.get('/campaigns', controller.listarCampanhas);
router.patch('/campaigns/:id', controller.atualizarCampanha);
router.get('/users', controller.listarUsuarios);
router.post('/users', controller.criarUsuario);
router.patch('/users/:id', controller.atualizarUsuario);
router.delete('/users/:id', controller.removerUsuario);
router.get('/audit', controller.listarAuditoria);

module.exports = router;
