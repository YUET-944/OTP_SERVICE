const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redisClient } = require('../config/redis');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000; // 1 hour
const EMAIL_RATE_LIMIT_MAX = Number(process.env.EMAIL_RATE_LIMIT_MAX) || 5;
const SMS_RATE_LIMIT_MAX = Number(process.env.SMS_RATE_LIMIT_MAX) || 3;
const IP_RATE_LIMIT_MAX = Number(process.env.IP_RATE_LIMIT_MAX) || 100;

const sendRedisCommand = (...args) => redisClient.call(...args);

const buildLimiter = ({ keyPrefix, max }) => {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return `${keyPrefix}:${req.body.identifier || req.ip}`;
    },
    handler: (req, res, next, options) => {
      logger.warn('Rate limit exceeded', {
        key: options.keyGenerator(req),
        max,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      next(new ApiError({
        statusCode: options.statusCode,
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please try again later.',
        requestId: req.requestId,
      }));
    },
    store: new RedisStore({
      sendCommand: sendRedisCommand,
      prefix: keyPrefix,
    }),
  });
};

const emailRateLimiter = buildLimiter({ keyPrefix: 'rate:email', max: EMAIL_RATE_LIMIT_MAX });
const smsRateLimiter = buildLimiter({ keyPrefix: 'rate:sms', max: SMS_RATE_LIMIT_MAX });
const ipRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: IP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `rate:ip:${req.ip}`,
  handler: (req, res, next, options) => {
    logger.warn('IP rate limit exceeded', {
      ip: req.ip,
      max: IP_RATE_LIMIT_MAX,
      windowMs: RATE_LIMIT_WINDOW_MS,
    });
    next(new ApiError({
      statusCode: options.statusCode,
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests from this IP. Please try again later.',
      requestId: req.requestId,
    }));
  },
  store: new RedisStore({
    sendCommand: sendRedisCommand,
    prefix: 'rate:ip',
  }),
});

module.exports = {
  emailRateLimiter,
  smsRateLimiter,
  ipRateLimiter,
};
