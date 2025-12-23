const { Pool } = require('pg');
const logger = require('../utils/logger');

const resolveEnv = (primary, fallback) => {
  if (process.env[primary]) return process.env[primary];
  if (fallback) return process.env[fallback];
  return undefined;
};

const pool = new Pool({
  host: resolveEnv('TEST_PG_HOST', 'PG_HOST') || 'localhost',
  port: Number(resolveEnv('TEST_PG_PORT', 'PG_PORT')) || 5432,
  database: resolveEnv('TEST_PG_DATABASE', 'PG_DATABASE') || 'otp_service',
  user: resolveEnv('TEST_PG_USER', 'PG_USER') || 'postgres',
  password: resolveEnv('TEST_PG_PASSWORD', 'PG_PASSWORD') || 'postgres',
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT) || 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug('Executed query', { text, duration, rows: res.rowCount });
  return res;
};

module.exports = {
  pool,
  query,
};
