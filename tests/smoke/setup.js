const path = require('path');
const dotenv = require('dotenv');

// Load env vars before importing application modules
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

jest.setTimeout(30000);

// Allow overriding service hosts when tests run outside docker network
process.env.REDIS_HOST = process.env.TEST_REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1';
process.env.PG_HOST = process.env.TEST_PG_HOST || process.env.PG_HOST || '127.0.0.1';
process.env.PG_USER = process.env.TEST_PG_USER || process.env.PG_USER;
process.env.PG_PASSWORD = process.env.TEST_PG_PASSWORD || process.env.PG_PASSWORD;
process.env.PG_DATABASE = process.env.TEST_PG_DATABASE || process.env.PG_DATABASE;

// Provide strong defaults for secrets required by configuration validation
const ensureStrongSecret = (envKey, fallback) => {
  const current = process.env[envKey];
  if (current && current.length >= 16 && !current.includes('replace') && !current.includes('change')) {
    return;
  }
  process.env[envKey] = fallback;
};

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
ensureStrongSecret('OTP_SECRET', 'test_otp_secret_key_123456');
ensureStrongSecret('JWT_SECRET', 'test_jwt_secret_key_123456');
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'local-admin-key';

const { connectRedis, redisClient } = require('../../src/config/redis');
const { pool } = require('../../src/config/database');
const logger = require('../../src/utils/logger');
const { ensureOtpLogsTable } = require('../../src/models/otpLog.model');
const { initApp } = require('../../src/app');

beforeAll(async () => {
  await initApp();
  await connectRedis();
  await ensureOtpLogsTable();
});

afterAll(async () => {
  try {
    await redisClient.quit();
  } catch (error) {
    logger.warn('Error closing Redis client in tests', { error: error.message });
  }

  try {
    await pool.end();
  } catch (error) {
    logger.warn('Error closing PostgreSQL pool in tests', { error: error.message });
  }
});
