// rotas de autenticacao
const { Router } = require('express');
const {
  login,
  registrar,
  perfil,
  listarCampanhasCadastro,
  listarCargosPoliticos,
  logout,
  statusMfa,
  iniciarMfa,
  confirmarMfa,
  desativarMfa,
  solicitarRecuperacao,
  redefinirSenha,
} = require('../controllers/authController');
const { autenticar, autenticarOpcional } = require('../middlewares/authMiddleware');
const { limiterLogin, limiterCadastro } = require('../middlewares/rateLimiter');

const router = Router();

// rotas abertas - sem autenticacao
router.post('/login', limiterLogin, login);
router.post('/password/forgot', limiterCadastro, solicitarRecuperacao);
router.post('/password/reset', limiterCadastro, redefinirSenha);
router.get('/cargos', listarCargosPoliticos);

// campanhas - so admin logado pode ver
router.get('/campanhas', autenticar, listarCampanhasCadastro);

// register pode ser conta nova (publica) ou convite de membro (autenticado)
// por isso uso autenticacao opcional aqui
router.post('/register', limiterCadastro, autenticarOpcional, registrar);

// rota protegida pra pegar dados do usuario logado
router.get('/me', autenticar, perfil);
router.post('/logout', autenticar, logout);
router.get('/mfa', autenticar, statusMfa);
router.post('/mfa/setup', autenticar, iniciarMfa);
router.post('/mfa/confirm', autenticar, confirmarMfa);
router.delete('/mfa', autenticar, desativarMfa);

module.exports = router;
