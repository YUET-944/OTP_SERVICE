const Redis = require('ioredis');
const logger = require('../utils/logger');

const {
  REDIS_HOST = 'localhost',
  REDIS_PORT = 6379,
  REDIS_PASSWORD,
  REDIS_DB = 0,
  REDIS_TLS_ENABLED,
} = process.env;

const redisOptions = {
  host: REDIS_HOST,
  port: Number(REDIS_PORT),
  db: Number(REDIS_DB),
  lazyConnect: true,
};

if (REDIS_PASSWORD) {
  redisOptions.password = REDIS_PASSWORD;
}

if (REDIS_TLS_ENABLED && REDIS_TLS_ENABLED.toLowerCase() === 'true') {
  redisOptions.tls = {};
}

const redisClient = new Redis(redisOptions);

redisClient.on('connect', () => {
  logger.info('Redis connection established');
});

redisClient.on('error', (error) => {
  logger.error('Redis connection error', { error: error.message });
});

const connectRedis = async () => {
  if (redisClient.status !== 'ready') {
    await redisClient.connect();
  }
  return redisClient;
};

module.exports = {
  redisClient,
  connectRedis,
};
