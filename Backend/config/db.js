require('dotenv').config();
const { Pool } = require('pg');

function montarSslConfig() {
  const rejeitarCertificadoInvalido = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

  if (process.env.DB_SSL === 'true') {
    return { rejectUnauthorized: rejeitarCertificadoInvalido };
  }

  if (!process.env.DATABASE_URL) {
    return false;
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

  return process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: rejeitarCertificadoInvalido }
    : false;
}

const sslConfig = montarSslConfig();

const conexao = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

const pool = new Pool({
  ...conexao,
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('erro no pool do banco:', process.env.NODE_ENV === 'production' ? (err.code || 'erro_conexao') : err.message);
});

async function testarConexao() {
  let client;
  try {
    client = await pool.connect();
    const res = await client.query('SELECT NOW() AS data_servidor');
    console.log('[DB] conectou com sucesso em:', res.rows[0].data_servidor);
    return true;
  } catch (err) {
    console.log('[DB] nao conseguiu conectar:', process.env.NODE_ENV === 'production' ? (err.code || 'erro_conexao') : err.message);
    console.log('[DB] confira o .env: DATABASE_URL ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
    return false;
  } finally {
    if (client) client.release();
  }
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
};
