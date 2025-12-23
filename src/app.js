const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createOtpRouter, createAdminOtpRouter } = require('./routes/otp.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');
const { connectRedis, redisClient } = require('./config/redis');
const { ensureOtpLogsTable } = require('./models/otpLog.model');
const { validateSecrets } = require('./utils/security');
const { createRequestLogger } = require('./middlewares/requestLogger');
const { ApiError } = require('./utils/errors');
const ERROR_CODES = require('./utils/errorCodes');

const app = express();

app.use(helmet());
app.use(express.json());
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(createRequestLogger());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const retryOperation = async (name, operation, {
  retries = Number(process.env.INIT_MAX_RETRIES) || 5,
  delay = Number(process.env.INIT_RETRY_DELAY_MS) || 2000,
} = {}) => {
  let attempt = 0;
  let lastError;
  while (attempt < retries) {
    attempt += 1;
    try {
      const result = await operation();
      if (attempt > 1) {
        logger.info(`${name} succeeded after retry`, { attempt });
      }
      return result;
    } catch (error) {
      lastError = error;
      logger.error(`${name} failed`, { attempt, error: error.message });
      if (attempt >= retries) {
        break;
      }
      await wait(delay * attempt);
    }
  }
  throw lastError;
};

const globalLimiter = rateLimit({
  windowMs: Number(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max: Number(process.env.GLOBAL_RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Global rate limit exceeded', {
      path: req.originalUrl,
      ip: req.ip,
      requestId: req.requestId,
    });
    next(new ApiError({
      statusCode: options.statusCode,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests. Please try again later.',
      requestId: req.requestId,
    }));
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'rate:global',
  }),
});

app.use(globalLimiter);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/otp', createOtpRouter());
app.use('/internal/otp', createAdminOtpRouter());

app.use(notFoundHandler);
app.use(errorHandler);

const initApp = async () => {
  validateSecrets();
  await retryOperation('Redis connection', connectRedis);
  await retryOperation('OTP logs table initialization', ensureOtpLogsTable);
  logger.info('Application initialization complete');
};

module.exports = {
  app,
  initApp,
};
