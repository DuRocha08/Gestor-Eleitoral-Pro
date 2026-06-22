// middleware de autenticacao JWT
// verifica o token e coloca o usuario no req.usuario

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'gestor-eleitoral-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'gestor-eleitoral-web';

function segredoJwtConfigurado() {
  return JWT_SECRET && JWT_SECRET.length >= 32;
}

// niveis de acesso existentes no sistema
const NIVEIS_VALIDOS = ['admin', 'coordenador', 'operador', 'visualizador'];

// numeracao dos niveis pra comparar quem tem mais permissao
const HIERARQUIA_NIVEIS = {
  visualizador: 1,
  operador: 2,
  coordenador: 3,
  admin: 4,
};

// busca o usuario e a campanha dele em um so SQL
const SQL_USUARIO_COM_CAMPANHA = `
  SELECT
    u.id,
    u.campanha_id,
    u.nivel,
    u.nome,
    u.email,
    u.telefone,
    u.ativo,
    u.token_versao,
    COALESCE((to_jsonb(u)->>'administrador_global')::boolean, false) AS administrador_global,
    COALESCE((to_jsonb(u)->>'mfa_ativo')::boolean, false) AS mfa_ativo,
    c.cargo_politico,
    c.cargo AS cargo_legado,
    c.modo_sistema,
    c.nome_candidato,
    c.nome_exibicao,
    c.municipio,
    c.uf,
    c.ano_eleicao,
    c.tenant_slug
  FROM usuarios u
  INNER JOIN campanhas c ON c.id = u.campanha_id
  WHERE u.id = $1
`;

function montarUsuarioSessao(row) {
  return {
    id: row.id,
    campanha_id: row.campanha_id,
    nivel: row.nivel,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cargo_politico: row.cargo_politico,
    cargo_legado: row.cargo_legado,
    modo_sistema: row.modo_sistema,
    nome_candidato: row.nome_candidato,
    nome_exibicao: row.nome_exibicao || row.nome_candidato,
    municipio: row.municipio,
    uf: row.uf,
    ano_eleicao: row.ano_eleicao,
    tenant_slug: row.tenant_slug,
    administrador_global: row.administrador_global,
    mfa_ativo: row.mfa_ativo,
  };
}

// bloqueia requisiocao se nao tiver token valido
async function autenticar(req, res, next) {
  try {
    if (!segredoJwtConfigurado()) {
      return res.status(500).json({ erro: 'JWT_SECRET nao configurado no servidor.' });
    }

    const cabecalhoAuth = req.headers.authorization;

    if (!cabecalhoAuth) {
      return res.status(401).json({ erro: 'Token de autenticacao nao fornecido.' });
    }

    const partes = cabecalhoAuth.split(' ');
    const tipo = partes[0];
    const token = partes[1];

    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ erro: 'Formato de token invalido. Use: Bearer <token>' });
    }

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (!payload.id || typeof payload.id !== 'string') {
      return res.status(401).json({ erro: 'Token invalido.' });
    }

    const resultado = await query(SQL_USUARIO_COM_CAMPANHA, [payload.id]);

    if (resultado.rows.length === 0) {
      return res.status(401).json({ erro: 'Usuario nao encontrado. Faca login novamente.' });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Conta de usuario desativada. Contate o administrador.' });
    }

    if (!Number.isInteger(payload.ver) || payload.ver !== usuario.token_versao) {
      return res.status(401).json({ erro: 'Sessao revogada. Faca login novamente.' });
    }

    req.usuario = montarUsuarioSessao(usuario);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Token expirado. Faca login novamente.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ erro: 'Token invalido.' });
    }
    next(err);
  }
}

// versao que nao bloqueia se nao tiver token - usa no cadastro publico
async function autenticarOpcional(req, res, next) {
  if (!segredoJwtConfigurado()) return next();

  const cabecalhoAuth = req.headers.authorization;

  if (!cabecalhoAuth) return next();

  try {
    const partes = cabecalhoAuth.split(' ');
    const tipo = partes[0];
    const token = partes[1];

    if (tipo !== 'Bearer' || !token) return next();

    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const resultado = await query(SQL_USUARIO_COM_CAMPANHA, [payload.id]);

    if (resultado.rows.length > 0 && resultado.rows[0].ativo &&
        Number.isInteger(payload.ver) && payload.ver === resultado.rows[0].token_versao) {
      req.usuario = montarUsuarioSessao(resultado.rows[0]);
    }
  } catch {
    // token invalido mas rota e publica, tudo bem
  }

  next();
}

// verifica se o usuario tem um dos niveis listados
function autorizarNiveis(...niveisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Usuario nao autenticado.' });
    }

    if (!niveisPermitidos.includes(req.usuario.nivel)) {
      return res.status(403).json({
        erro: 'Acesso negado. Nivel de permissao insuficiente.',
        nivel_requerido: niveisPermitidos,
        nivel_atual: req.usuario.nivel,
      });
    }

    next();
  };
}

// verifica se o usuario tem pelo menos o nivel minimo
function autorizarNivelMinimo(nivelMinimo) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ erro: 'Usuario nao autenticado.' });
    }

    const nivelUsuario = HIERARQUIA_NIVEIS[req.usuario.nivel] || 0;
    const nivelExigido = HIERARQUIA_NIVEIS[nivelMinimo] || 0;

    if (nivelUsuario < nivelExigido) {
      return res.status(403).json({
        erro: 'Acesso negado. Nivel minimo insuficiente.',
        nivel_minimo: nivelMinimo,
        nivel_atual: req.usuario.nivel,
      });
    }

    next();
  };
}

function autorizarAdministradorGlobal(req, res, next) {
  if (!req.usuario) {
    return res.status(401).json({ erro: 'Usuario nao autenticado.' });
  }
  if (!req.usuario.administrador_global) {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador da plataforma.' });
  }
  next();
}

function exigirMfaAdministrador(req, res, next) {
  if (!req.usuario?.mfa_ativo) {
    return res.status(403).json({
      erro: 'Ative a autenticacao em duas etapas antes de administrar a plataforma.',
      codigo: 'MFA_OBRIGATORIO',
    });
  }
  next();
}

// operador = cabo eleitoral no contexto eleitoral
function ehCaboEleitoral(usuario) {
  return usuario.nivel === 'operador';
}

// coordenador e admin tem acesso completo
function temAcessoAmplo(usuario) {
  return usuario.nivel === 'coordenador' || usuario.nivel === 'admin';
}

module.exports = {
  autenticar,
  autenticarOpcional,
  autorizarNiveis,
  autorizarNivelMinimo,
  ehCaboEleitoral,
  temAcessoAmplo,
  NIVEIS_VALIDOS,
  HIERARQUIA_NIVEIS,
  autorizarAdministradorGlobal,
  exigirMfaAdministrador,
};
