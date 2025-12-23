#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { v4: uuidv4 } = require('uuid');
const seedData = require('./seedData');
const { connectRedis, redisClient } = require('../src/config/redis');
const { pool } = require('../src/config/database');
const { ensureOtpLogsTable } = require('../src/models/otpLog.model');
const logger = require('../src/utils/logger');
const { seedEntries } = require('./seedHelpers');

const ensureMockMode = () => {
  const deliveryMode = (process.env.DELIVERY_MODE || '').toLowerCase();
  if (deliveryMode && deliveryMode !== 'mock') {
    logger.warn('Seed script detected non-mock delivery mode', { deliveryMode });
  }
};

const main = async () => {
  ensureMockMode();
  await connectRedis();
  await ensureOtpLogsTable();

  try {
    const seeded = await seedEntries(seedData);
    if (seeded.length > 0) {
      // eslint-disable-next-line no-console
      console.table(seeded.map((entry) => ({
        requestId: entry.requestId,
        channel: entry.channel,
        purpose: entry.purpose,
        identifier: entry.maskedIdentifier,
        otp: entry.maskedOtp,
      })));
    }
    logger.info('Seed complete', { seededRecords: seeded.length });
  } catch (error) {
    logger.error('Seed script encountered an error', { error: error.message });
    process.exitCode = 1;
  } finally {
    try {
      await redisClient.quit();
    } catch (error) {
      logger.warn('Error closing Redis client', { error: error.message });
    }

    try {
      await pool.end();
    } catch (error) {
      logger.warn('Error closing PostgreSQL pool', { error: error.message });
    }
  }
};

main();
