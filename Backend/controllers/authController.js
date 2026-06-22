// authController.js
// login, cadastro de conta nova e cadastro de membro da equipe
// obs: nao retornar senha_hash na resposta nunca!

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../config/db');
const { NIVEIS_VALIDOS } = require('../middlewares/authMiddleware');
const {
  CARGOS_POLITICOS, ROTULOS_CARGO, cargoValido, rotuloCargo,
} = require('../constants/cargosPoliticos');
const { gerarTenantSlug } = require('../utils/tenant');
const { registrar: registrarAuditoria, ACOES } = require('../utils/auditoria');
const { limparTexto, normalizarEmail, emailValido, normalizarUf, ufValida } = require('../utils/validacao');
const {
  gerarSegredo, verificarCodigoTotp, criptografarSegredo,
  descriptografarSegredo, gerarCodigosReserva, montarUri,
} = require('../utils/mfa');
const { enviarRecuperacaoSenha } = require('../services/emailService');

// O custo 12 deixa o hash mais caro para ataques sem tornar o login lento demais.
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'gestor-eleitoral-api';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'gestor-eleitoral-web';
const EXPIRACAO_CONFIGURADA = parseInt(process.env.JWT_EXPIRES_IN, 10) || 3600;
const JWT_EXPIRES_IN = process.env.NODE_ENV === 'production'
  ? Math.min(EXPIRACAO_CONFIGURADA, 3600)
  : EXPIRACAO_CONFIGURADA;

const MAX_TENTATIVAS_LOGIN = 5;
const MINUTOS_BLOQUEIO = 15;
const HASH_SENHA_INEXISTENTE = '$2b$12$EiFMsBJQrl6iqkrMSLlxw.VMZadoooEjQTHgDC9zK2nfkhom0Xriu';

const NIVEL_PADRAO_MEMBRO = 'operador';
const NIVEL_RESPONSAVEL_CAMPANHA = 'coordenador';

// busca usuario + dados da campanha no login
const SQL_USUARIO_LOGIN = `
  SELECT u.id, u.campanha_id, u.nivel, u.nome, u.email, u.senha_hash, u.telefone, u.ativo,
         u.tentativas_login_falhas, u.bloqueado_ate, u.token_versao,
         COALESCE((to_jsonb(u)->>'administrador_global')::boolean, false) AS administrador_global,
         COALESCE((to_jsonb(u)->>'mfa_ativo')::boolean, false) AS mfa_ativo,
         to_jsonb(u)->>'mfa_segredo_criptografado' AS mfa_segredo_criptografado,
         COALESCE(to_jsonb(u)->'mfa_codigos_reserva', '[]'::jsonb) AS mfa_codigos_reserva,
         c.cargo_politico, c.modo_sistema, c.nome_candidato, c.nome_exibicao, c.municipio, c.uf, c.tenant_slug
  FROM usuarios u
  INNER JOIN campanhas c ON c.id = u.campanha_id
  WHERE u.email = $1
`;

// monta resposta sem expor campos internos
function montarUsuarioResposta(row) {
  return {
    id: row.id,
    campanha_id: row.campanha_id,
    nivel: row.nivel,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    cargo_politico: row.cargo_politico,
    modo_sistema: row.modo_sistema,
    nome_candidato: row.nome_candidato,
    nome_exibicao: row.nome_exibicao || row.nome_candidato,
    municipio: row.municipio,
    uf: row.uf,
    tenant_slug: row.tenant_slug,
    cargo_rotulo: rotuloCargo(row.cargo_politico),
    administrador_global: Boolean(row.administrador_global),
    mfa_ativo: Boolean(row.mfa_ativo),
  };
}

// valida se a senha tem os requisitos minimos
function validarForcaSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 12) {
    return 'A senha deve ter no minimo 12 caracteres.';
  }
  if (Buffer.byteLength(senha, 'utf8') > 72) {
    return 'A senha deve ter no maximo 72 bytes.';
  }
  if (!/[A-Z]/.test(senha)) {
    return 'A senha deve conter ao menos uma letra maiuscula.';
  }
  if (!/[a-z]/.test(senha)) {
    return 'A senha deve conter ao menos uma letra minuscula.';
  }
  if (!/[0-9]/.test(senha)) {
    return 'A senha deve conter ao menos um numero.';
  }
  if (!/[^A-Za-z0-9]/.test(senha)) {
    return 'A senha deve conter ao menos um caractere especial.';
  }
  const comum = senha.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['password123', 'senha123456', 'admin123456', 'gestoreleitoral'].includes(comum)) {
    return 'Escolha uma senha menos previsivel.';
  }
  return null;
}

function validarJwtSecret() {
  return JWT_SECRET && JWT_SECRET.length >= 32;
}

function textoDentroDoLimite(valor, limite, obrigatorio = false) {
  if (valor === undefined || valor === null || valor === '') return !obrigatorio;
  return typeof valor === 'string' && valor.trim().length > 0 && valor.trim().length <= limite;
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, senha, codigo_mfa } = req.body;
    const emailNorm = normalizarEmail(email);

    if (!emailNorm || typeof senha !== 'string' || !senha) {
      return res.status(400).json({ erro: 'E-mail e senha sao obrigatorios.' });
    }

    if (Buffer.byteLength(senha, 'utf8') > 72) {
      return res.status(400).json({ erro: 'Senha invalida.' });
    }

    if (!emailValido(emailNorm)) {
      return res.status(400).json({ erro: 'E-mail invalido.' });
    }

    if (!validarJwtSecret()) {
      return res.status(500).json({ erro: 'JWT_SECRET nao configurado no servidor.' });
    }

    const resultado = await query(SQL_USUARIO_LOGIN, [emailNorm]);

    if (resultado.rows.length === 0) {
      await bcrypt.compare(senha, HASH_SENHA_INEXISTENTE);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const usuario = resultado.rows[0];

    if (!usuario.ativo || (usuario.bloqueado_ate && new Date(usuario.bloqueado_ate) > new Date())) {
      await bcrypt.compare(senha, HASH_SENHA_INEXISTENTE);
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaValida) {
      await query(
        `UPDATE usuarios SET
           tentativas_login_falhas = CASE
             WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= NOW() THEN 1
             ELSE LEAST(tentativas_login_falhas + 1, 100)
           END,
           bloqueado_ate = CASE
             WHEN (CASE
               WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= NOW() THEN 1
               ELSE tentativas_login_falhas + 1
             END) >= $2
             THEN NOW() + ($3 * INTERVAL '1 minute')
             ELSE CASE
               WHEN bloqueado_ate IS NOT NULL AND bloqueado_ate <= NOW() THEN NULL
               ELSE bloqueado_ate
             END
           END
         WHERE id = $1`,
        [usuario.id, MAX_TENTATIVAS_LOGIN, MINUTOS_BLOQUEIO]
      );
      await registrarAuditoria({
        campanha_id: usuario.campanha_id,
        usuario_id: usuario.id,
        acao: ACOES.LOGIN_FALHA,
        entidade: 'usuario',
        entidade_id: usuario.id,
        ip: req.ip,
        antes: null,
        depois: null,
      });
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    if (usuario.mfa_ativo) {
      if (!codigo_mfa) {
        return res.status(202).json({
          mfa_necessario: true,
          mensagem: 'Informe o codigo do aplicativo autenticador ou um codigo de reserva.',
        });
      }

      let codigoValido = false;
      try {
        const segredo = descriptografarSegredo(usuario.mfa_segredo_criptografado);
        codigoValido = verificarCodigoTotp(segredo, codigo_mfa);
      } catch (_) {
        codigoValido = false;
      }

      if (!codigoValido) {
        const hashes = Array.isArray(usuario.mfa_codigos_reserva) ? usuario.mfa_codigos_reserva : [];
        for (const hash of hashes) {
          if (await bcrypt.compare(String(codigo_mfa).toUpperCase(), hash)) {
            const restantes = hashes.filter(item => item !== hash);
            const consumo = await query(
              `UPDATE usuarios SET mfa_codigos_reserva=$2::jsonb
               WHERE id=$1 AND mfa_codigos_reserva @> $3::jsonb`,
              [usuario.id, JSON.stringify(restantes), JSON.stringify([hash])]
            );
            codigoValido = consumo.rowCount === 1;
            break;
          }
        }
      }

      if (!codigoValido) {
        return res.status(401).json({ erro: 'Codigo de autenticacao invalido.' });
      }
    }

    await query(
      `UPDATE usuarios SET ultimo_acesso = NOW(), tentativas_login_falhas = 0,
       bloqueado_ate = NULL WHERE id = $1`,
      [usuario.id]
    );

    const payloadToken = {
      id: usuario.id,
      campanha_id: usuario.campanha_id,
      nivel: usuario.nivel,
      email: usuario.email,
      cargo_politico: usuario.cargo_politico,
      ver: usuario.token_versao,
    };

    const token = jwt.sign(payloadToken, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: usuario.id,
    });
    const usuarioPublico = montarUsuarioResposta(usuario);

    await registrarAuditoria({
      campanha_id: usuario.campanha_id,
      usuario_id: usuario.id,
      acao: ACOES.LOGIN_SUCESSO,
      entidade: 'usuario',
      entidade_id: usuario.id,
      ip: req.ip,
      antes: null,
      depois: null,
    });

    return res.status(200).json({
      mensagem: 'Login realizado com sucesso.',
      token,
      usuario: usuarioPublico,
      expira_em_segundos: JWT_EXPIRES_IN,
    });
  } catch (err) {
    next(err);
  }
}

async function verificarSenhaAtual(usuarioId, senha) {
  if (typeof senha !== 'string' || !senha || Buffer.byteLength(senha, 'utf8') > 72) return false;
  const resultado = await query('SELECT senha_hash FROM usuarios WHERE id=$1', [usuarioId]);
  return resultado.rows[0] ? bcrypt.compare(senha, resultado.rows[0].senha_hash) : false;
}

async function statusMfa(req, res, next) {
  try {
    const resultado = await query(
      "SELECT COALESCE((to_jsonb(u)->>'mfa_ativo')::boolean, false) AS ativo FROM usuarios u WHERE id=$1",
      [req.usuario.id]
    );
    return res.json({ ativo: Boolean(resultado.rows[0]?.ativo) });
  } catch (err) { next(err); }
}

async function iniciarMfa(req, res, next) {
  try {
    if (!(await verificarSenhaAtual(req.usuario.id, req.body.senha))) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    const segredo = gerarSegredo();
    return res.json({ segredo, uri: montarUri(segredo, req.usuario.email) });
  } catch (err) { next(err); }
}

async function confirmarMfa(req, res, next) {
  try {
    const { senha, segredo, codigo } = req.body;
    if (!(await verificarSenhaAtual(req.usuario.id, senha))) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    if (!/^[A-Z2-7]{20,64}$/.test(String(segredo || '')) || !verificarCodigoTotp(segredo, codigo)) {
      return res.status(400).json({ erro: 'Codigo MFA invalido.' });
    }
    const codigos = gerarCodigosReserva();
    const hashes = [];
    for (const codigoReserva of codigos) hashes.push(await bcrypt.hash(codigoReserva, 10));
    await query(
      `UPDATE usuarios SET mfa_ativo=true, mfa_segredo_criptografado=$2,
       mfa_codigos_reserva=$3::jsonb, token_versao=token_versao+1 WHERE id=$1`,
      [req.usuario.id, criptografarSegredo(segredo), JSON.stringify(hashes)]
    );
    await registrarAuditoria({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: ACOES.MFA_ATIVADO, entidade: 'usuario', entidade_id: req.usuario.id,
      ip: req.ip, antes: { mfa: false }, depois: { mfa: true },
    });
    return res.json({ mensagem: 'MFA ativado. Entre novamente.', codigos_reserva: codigos });
  } catch (err) { next(err); }
}

async function desativarMfa(req, res, next) {
  try {
    const { senha, codigo } = req.body;
    if (!(await verificarSenhaAtual(req.usuario.id, senha))) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    const resultado = await query(
      'SELECT mfa_ativo, mfa_segredo_criptografado FROM usuarios WHERE id=$1',
      [req.usuario.id]
    );
    const usuario = resultado.rows[0];
    if (!usuario?.mfa_ativo) return res.status(400).json({ erro: 'MFA nao esta ativo.' });
    if (!verificarCodigoTotp(descriptografarSegredo(usuario.mfa_segredo_criptografado), codigo)) {
      return res.status(400).json({ erro: 'Codigo MFA invalido.' });
    }
    await query(
      `UPDATE usuarios SET mfa_ativo=false, mfa_segredo_criptografado=NULL,
       mfa_codigos_reserva='[]'::jsonb, token_versao=token_versao+1 WHERE id=$1`,
      [req.usuario.id]
    );
    await registrarAuditoria({
      campanha_id: req.usuario.campanha_id, usuario_id: req.usuario.id,
      acao: ACOES.MFA_DESATIVADO, entidade: 'usuario', entidade_id: req.usuario.id,
      ip: req.ip, antes: { mfa: true }, depois: { mfa: false },
    });
    return res.json({ mensagem: 'MFA desativado. Entre novamente.' });
  } catch (err) { next(err); }
}

async function solicitarRecuperacao(req, res, next) {
  const inicio = Date.now();
  try {
    const email = normalizarEmail(req.body.email);
    if (email && emailValido(email)) {
      const resultado = await query('SELECT id FROM usuarios WHERE email=$1 AND ativo=true', [email]);
      if (resultado.rows[0]) {
        await query(
          `DELETE FROM tokens_recuperacao_senha
           WHERE expira_em<NOW() OR usado_em IS NOT NULL OR usuario_id=$1`,
          [resultado.rows[0].id]
        );
        const token = crypto.randomBytes(32).toString('base64url');
        const hash = crypto.createHash('sha256').update(token).digest('hex');
        await query(
          `INSERT INTO tokens_recuperacao_senha (usuario_id, token_hash, expira_em)
           VALUES ($1,$2,NOW()+INTERVAL '30 minutes')`,
          [resultado.rows[0].id, hash]
        );
        const envio = await enviarRecuperacaoSenha(email, token).catch(function(erro) {
          console.error('[RECUPERACAO] falha no envio:', process.env.NODE_ENV === 'production' ? (erro.code || erro.name) : erro.message);
          return { enviado: false, motivo: 'falha_envio' };
        });
        const resposta = { mensagem: 'Se o e-mail existir, as instrucoes serao enviadas.' };
        if (process.env.NODE_ENV !== 'production' && !envio.enviado) resposta.token_desenvolvimento = token;
        const espera = Math.max(0, 500 - (Date.now() - inicio));
        if (espera) await new Promise(resolve => setTimeout(resolve, espera));
        return res.json(resposta);
      }
    }
    const espera = Math.max(0, 500 - (Date.now() - inicio));
    if (espera) await new Promise(resolve => setTimeout(resolve, espera));
    return res.json({ mensagem: 'Se o e-mail existir, as instrucoes serao enviadas.' });
  } catch (err) { next(err); }
}

async function redefinirSenha(req, res, next) {
  let client;
  try {
    const { token, senha } = req.body;
    const erroSenha = validarForcaSenha(senha);
    if (erroSenha) return res.status(400).json({ erro: erroSenha });
    if (typeof token !== 'string' || token.length < 32) return res.status(400).json({ erro: 'Token invalido.' });
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    client = await getClient();
    await client.query('BEGIN');
    const resultado = await client.query(
      `SELECT id, usuario_id FROM tokens_recuperacao_senha
       WHERE token_hash=$1 AND usado_em IS NULL AND expira_em>NOW() FOR UPDATE`, [hash]
    );
    if (!resultado.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(400).json({ erro: 'Token invalido ou expirado.' });
    }
    const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);
    await client.query(
      `UPDATE usuarios SET senha_hash=$2, token_versao=token_versao+1,
       tentativas_login_falhas=0, bloqueado_ate=NULL WHERE id=$1`,
      [resultado.rows[0].usuario_id, senhaHash]
    );
    await client.query('UPDATE tokens_recuperacao_senha SET usado_em=NOW() WHERE id=$1', [resultado.rows[0].id]);
    await client.query('COMMIT');
    return res.json({ mensagem: 'Senha redefinida. Faca login novamente.' });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(function() {});
    next(err);
  } finally { if (client) client.release(); }
}

// POST /api/auth/logout - revoga imediatamente todos os tokens atuais da conta.
async function logout(req, res, next) {
  try {
    await query(
      'UPDATE usuarios SET token_versao = token_versao + 1 WHERE id = $1 AND campanha_id = $2',
      [req.usuario.id, req.usuario.campanha_id]
    );
    await registrarAuditoria({
      campanha_id: req.usuario.campanha_id,
      usuario_id: req.usuario.id,
      acao: ACOES.LOGOUT,
      entidade: 'usuario',
      entidade_id: req.usuario.id,
      ip: req.ip,
      antes: null,
      depois: null,
    });
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/cargos - lista os cargos politicos do sistema
function listarCargosPoliticos(req, res) {
  const dados = CARGOS_POLITICOS.map(function(valor) {
    return { valor: valor, rotulo: ROTULOS_CARGO[valor] };
  });
  return res.status(200).json({ dados });
}

// cria conta nova com campanha do zero
async function registrarNovaConta(req, res, next) {
  let client;

  try {
    const {
      nome, nome_candidato, email, senha, telefone,
      cargo_politico, municipio, uf, ano_eleicao, modo_sistema,
    } = req.body;

    if (!textoDentroDoLimite(nome, 255, true) ||
        !textoDentroDoLimite(nome_candidato, 255, true) ||
        !textoDentroDoLimite(email, 255, true) ||
        !textoDentroDoLimite(telefone, 20) ||
        !textoDentroDoLimite(municipio, 150) ||
        !textoDentroDoLimite(uf, 2)) {
      return res.status(400).json({ erro: 'Um ou mais campos de texto possuem formato ou tamanho invalido.' });
    }

    const nomeLimpo = limparTexto(nome);
    const candidatoLimpo = limparTexto(nome_candidato);
    const emailNorm = normalizarEmail(email);
    const telefoneLimpo = limparTexto(telefone, 20);
    const municipioLimpo = limparTexto(municipio, 150);
    const ufLimpa = normalizarUf(uf);

    if (!nomeLimpo || !candidatoLimpo || !emailNorm || !senha || !cargo_politico) {
      return res.status(400).json({
        erro: 'Campos obrigatorios: nome, nome_candidato, email, senha e cargo_politico.',
      });
    }

    if (!emailValido(emailNorm)) {
      return res.status(400).json({ erro: 'E-mail invalido.' });
    }

    if (ufLimpa && !ufValida(ufLimpa)) {
      return res.status(400).json({ erro: 'UF deve ter 2 letras.' });
    }

    if (!cargoValido(cargo_politico)) {
      return res.status(400).json({ erro: 'Cargo politico invalido.', cargos_validos: CARGOS_POLITICOS });
    }

    const erroSenha = validarForcaSenha(senha);
    if (erroSenha) {
      return res.status(400).json({ erro: erroSenha });
    }

    const anoInformado = parseInt(ano_eleicao, 10);
    if (ano_eleicao && (!Number.isInteger(anoInformado) || anoInformado < 2000 || anoInformado > 2100)) {
      return res.status(400).json({ erro: 'Ano da eleicao invalido.' });
    }
    const ano = anoInformado || new Date().getFullYear() + (new Date().getMonth() >= 6 ? 2 : 0);
    const slug = gerarTenantSlug(nome_candidato, cargo_politico);
    const cargoLegado = ROTULOS_CARGO[cargo_politico];
    const modo = modo_sistema === 'gabinete' ? 'gabinete' : 'campanha';

    const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1', [emailNorm]);
    if (emailExiste.rows.length > 0) {
      return res.status(409).json({ erro: 'E-mail ja cadastrado. Faca login ou recupere sua conta.' });
    }

    const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

    client = await getClient();
    await client.query('BEGIN');

    const campanhaInsert = await client.query(
      `INSERT INTO campanhas (
         nome_candidato, nome_exibicao, cargo, cargo_politico, municipio, uf,
         ano_eleicao, status, modo_sistema, tenant_slug
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ativa', $8, $9)
       RETURNING id, cargo_politico, modo_sistema, nome_candidato, tenant_slug`,
      [
        candidatoLimpo, candidatoLimpo, cargoLegado, cargo_politico,
        municipioLimpo, ufLimpa,
        ano, modo, slug,
      ]
    );

    const campanha = campanhaInsert.rows[0];

    const usuarioInsert = await client.query(
      `INSERT INTO usuarios (campanha_id, nivel, nome, email, senha_hash, telefone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, campanha_id, nivel, nome, email, telefone`,
      [campanha.id, NIVEL_RESPONSAVEL_CAMPANHA, nomeLimpo, emailNorm, senhaHash, telefoneLimpo]
    );

    const usuario = usuarioInsert.rows[0];

    await client.query(
      'UPDATE campanhas SET proprietario_usuario_id = $1 WHERE id = $2',
      [usuario.id, campanha.id]
    );

    await client.query('COMMIT');

    await registrarAuditoria({
      campanha_id: campanha.id,
      usuario_id: usuario.id,
      acao: ACOES.CONTA_CRIADA,
      entidade: 'usuario',
      entidade_id: usuario.id,
      ip: req.ip,
      antes: null,
      depois: { nivel: usuario.nivel },
    });

    return res.status(201).json({
      mensagem: 'Conta criada com sucesso.',
      tenant: {
        campanha_id: campanha.id,
        tenant_slug: campanha.tenant_slug,
        cargo_politico: campanha.cargo_politico,
        modo_sistema: campanha.modo_sistema,
      },
      usuario: Object.assign({}, usuario, {
        cargo_politico: campanha.cargo_politico,
        cargo_rotulo: rotuloCargo(campanha.cargo_politico),
        nome_candidato: campanha.nome_candidato,
      }),
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(function() {});
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'E-mail ja cadastrado.' });
    }
    if (err.code === '42703') {
      return res.status(500).json({
        erro: 'Banco desatualizado.',
      });
    }
    next(err);
  } finally {
    if (client) client.release();
  }
}

// cadastra membro numa campanha que ja existe
async function registrarMembroEquipe(req, res, next) {
  try {
    const { campanha_id, nome, email, senha, nivel, telefone } = req.body;

    if (!textoDentroDoLimite(nome, 255, true) ||
        !textoDentroDoLimite(email, 255, true) ||
        !textoDentroDoLimite(telefone, 20)) {
      return res.status(400).json({ erro: 'Um ou mais campos de texto possuem formato ou tamanho invalido.' });
    }
    if (nivel !== undefined && (typeof nivel !== 'string' || !NIVEIS_VALIDOS.includes(nivel))) {
      return res.status(400).json({ erro: 'Nivel de acesso invalido.' });
    }

    const podeConvidar = req.usuario?.nivel === 'admin' || req.usuario?.nivel === 'coordenador';
    if (!podeConvidar) {
      return res.status(403).json({ erro: 'Apenas coordenador ou administrador podem convidar membros.' });
    }

    const nomeLimpo = limparTexto(nome);
    const emailNorm = normalizarEmail(email);
    const telefoneLimpo = limparTexto(telefone, 20);

    if (!nomeLimpo || !emailNorm || !senha) {
      return res.status(400).json({ erro: 'Campos obrigatorios: nome, email e senha.' });
    }

    if (!emailValido(emailNorm)) {
      return res.status(400).json({ erro: 'E-mail invalido.' });
    }

    if (campanha_id && campanha_id !== req.usuario.campanha_id) {
      return res.status(403).json({
        erro: 'Nao e permitido cadastrar usuarios em outra instancia.',
      });
    }

    const campanhaId = req.usuario.campanha_id;

    if (nivel === 'coordenador' && req.usuario.nivel !== 'admin') {
      const proprietario = await query(
        'SELECT proprietario_usuario_id FROM campanhas WHERE id=$1',
        [campanhaId]
      );
      if (proprietario.rows[0]?.proprietario_usuario_id !== req.usuario.id) {
        return res.status(403).json({
          erro: 'Somente o responsavel principal pode criar outro coordenador.',
        });
      }
    }

    let nivelAcesso = NIVEL_PADRAO_MEMBRO;
    if (nivel && NIVEIS_VALIDOS.includes(nivel) && nivel !== 'admin') {
      nivelAcesso = nivel;
    }

    if (nivel === 'admin') {
      return res.status(403).json({ erro: 'Nao e permitido criar usuario com nivel administrador.' });
    }

    const erroSenha = validarForcaSenha(senha);
    if (erroSenha) {
      return res.status(400).json({ erro: erroSenha });
    }

    const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1', [emailNorm]);
    if (emailExiste.rows.length > 0) {
      return res.status(409).json({ erro: 'E-mail ja cadastrado.' });
    }

    const senhaHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

    const novoUsuario = await query(
      `INSERT INTO usuarios (campanha_id, nivel, nome, email, senha_hash, telefone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, campanha_id, nivel, nome, email, telefone, ativo`,
      [campanhaId, nivelAcesso, nomeLimpo, emailNorm, senhaHash, telefoneLimpo]
    );

    await registrarAuditoria({
      campanha_id: campanhaId,
      usuario_id: req.usuario.id,
      acao: ACOES.USUARIO_CRIADO,
      entidade: 'usuario',
      entidade_id: novoUsuario.rows[0].id,
      ip: req.ip,
      antes: null,
      depois: { nivel: novoUsuario.rows[0].nivel },
    });

    return res.status(201).json({
      mensagem: 'Membro da equipe cadastrado na sua instancia.',
      usuario: novoUsuario.rows[0],
      registrado_por: req.usuario.id,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'E-mail ja cadastrado.' });
    }
    next(err);
  }
}

// POST /api/auth/register - decide se e conta nova ou convite
async function registrar(req, res, next) {
  try {
    const { nova_conta, campanha_id, cargo_politico, nome_candidato, nivel } = req.body;

    if (nivel === 'admin') {
      return res.status(403).json({ erro: 'Nao e permitido definir nivel administrador no cadastro.' });
    }

    const ehCadastroInstitucional =
      nova_conta === true || (!req.usuario && cargo_politico && nome_candidato && !campanha_id);

    if (ehCadastroInstitucional) {
      if (process.env.ALLOW_PUBLIC_REGISTRATION === 'false' && !req.usuario) {
        return res.status(403).json({
          erro: 'Cadastro de novas contas temporariamente desativado.',
        });
      }
      return registrarNovaConta(req, res, next);
    }

    if (req.usuario) {
      return registrarMembroEquipe(req, res, next);
    }

    return res.status(400).json({
      erro: 'Cadastro publico de equipe desativado. Crie sua conta institucional ou solicite convite ao administrador.',
      dica: 'Use o formulario de nova conta com cargo politico.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/campanhas - so admin ve
async function listarCampanhasCadastro(req, res, next) {
  try {
    if (!req.usuario || req.usuario.nivel !== 'admin') {
      return res.status(403).json({
        erro: 'Listagem de campanhas restrita. Cadastre nova conta institucional em /register.',
      });
    }

    const resultado = await query(
      `SELECT id, nome_candidato, cargo_politico, municipio, uf, ano_eleicao, tenant_slug
       FROM campanhas WHERE id = $1`,
      [req.usuario.campanha_id]
    );

    return res.status(200).json({ dados: resultado.rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me - retorna usuario logado
async function perfil(req, res, next) {
  try {
    return res.status(200).json({ usuario: req.usuario });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  registrar,
  registrarNovaConta,
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
};
