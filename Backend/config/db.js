require('dotenv').config();
const { Pool } = require('pg');

const sslConfig = process.env.DB_SSL === 'true'
  ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : false;

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
    console.log('[DB] confira o .env: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
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
