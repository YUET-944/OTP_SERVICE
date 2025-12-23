const { redisClient } = require('../../../src/config/redis');
const { query } = require('../../../src/config/database');

const resetState = async () => {
  await redisClient.flushall();
  await query('TRUNCATE otp_logs RESTART IDENTITY CASCADE');
};

module.exports = {
  resetState,
};
