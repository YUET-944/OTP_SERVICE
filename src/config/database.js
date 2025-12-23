const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'otp_service',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
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
