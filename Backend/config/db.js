require('dotenv').config();
const { Pool } = require('pg');

function montarSslConfig() {
  const rejeitarCertificadoInvalido = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (!process.env.DATABASE_URL) {
    return process.env.DB_SSL === 'true'
      ? { rejectUnauthorized: rejeitarCertificadoInvalido }
      : false;
  }

  let urlBanco;
  try {
    urlBanco = new URL(process.env.DATABASE_URL);
  } catch (_) {
    return process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: rejeitarCertificadoInvalido }
      : false;
  }

  const sslMode = String(urlBanco.searchParams.get('sslmode') || '').toLowerCase();
  if (sslMode === 'disable') {
    return false;
  }
  if (sslMode === 'require' || sslMode === 'prefer' || sslMode === 'allow' || sslMode === 'no-verify') {
    return { rejectUnauthorized: false };
  }
  if (sslMode === 'verify-ca' || sslMode === 'verify-full') {
    return { rejectUnauthorized: rejeitarCertificadoInvalido };
  }
  if (process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: rejeitarCertificadoInvalido };
  }

  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: rejeitarCertificadoInvalido }
    : false;
}

const sslConfig = montarSslConfig();

function montarConexao() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      url.searchParams.delete('sslmode');
      return { connectionString: url.toString() };
    } catch (_) {
      return { connectionString: process.env.DATABASE_URL };
    }
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const conexao = montarConexao();

function mascarar(valor) {
  if (!valor) return null;
  const texto = String(valor);
  if (texto.length <= 3) return '***';
  return texto.slice(0, 2) + '***' + texto.slice(-1);
}

function descreverBanco() {
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      return {
        origem: 'DATABASE_URL',
        host: url.hostname,
        porta: url.port || '5432',
        banco: url.pathname.replace('/', '') || null,
        usuario: mascarar(decodeURIComponent(url.username)),
        ssl: sslConfig ? 'ativo' : 'desativado',
        ssl_reject_unauthorized: Boolean(sslConfig && sslConfig.rejectUnauthorized),
      };
    } catch (_) {
      return { origem: 'DATABASE_URL', url_valida: false };
    }
  }

  return {
    origem: 'DB_*',
    host: process.env.DB_HOST || null,
    porta: process.env.DB_PORT || '5432',
    banco: process.env.DB_NAME || null,
    usuario: mascarar(process.env.DB_USER),
    ssl: sslConfig ? 'ativo' : 'desativado',
    ssl_reject_unauthorized: Boolean(sslConfig && sslConfig.rejectUnauthorized),
  };
}

function detalhesErroBanco(err) {
  return {
    code: err?.code || null,
    name: err?.name || null,
    message: err?.message || null,
    detail: err?.detail || null,
    hint: err?.hint || null,
    table: err?.table || null,
    column: err?.column || null,
    constraint: err?.constraint || null,
  };
}

const pool = new Pool({
  ...conexao,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] erro no pool:', detalhesErroBanco(err));
});

async function testarConexao() {
  let client;
  try {
    console.log('[DB] tentando conectar:', descreverBanco());
    client = await pool.connect();
    const res = await client.query('SELECT NOW() AS data_servidor');
    console.log('[DB] conectou com sucesso em:', res.rows[0].data_servidor);
    return { ok: true };
  } catch (err) {
    console.error('[DB] nao conseguiu conectar:', detalhesErroBanco(err));
    console.log('[DB] confira o .env: DATABASE_URL ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
    return { ok: false, erro: detalhesErroBanco(err) };
  } finally {
    if (client) client.release();
  }
}

async function verificarEstruturaBasica() {
  const tabelas = [
    'campanhas',
    'usuarios',
    'apoiadores',
    'eleitores',
    'demandas_comunidade',
    'categorias_financeiras',
    'movimentacoes_financeiras',
    'auditoria',
    'jobs_importacao',
  ];
  const resultado = await query(
    `SELECT nome
       FROM unnest($1::text[]) AS t(nome)
      WHERE to_regclass('public.' || nome) IS NULL`,
    [tabelas]
  );
  return resultado.rows.map(function(row) { return row.nome; });
}

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function getClient() {
  return pool.connect();
}

async function encerrarPool() {
  return pool.end();
}

module.exports = {
  pool,
  query,
  getClient,
  encerrarPool,
  testarConexao,
  verificarEstruturaBasica,
  detalhesErroBanco,
  descreverBanco,
};
