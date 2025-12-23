const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { isIP } = require('net');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');
const logger = require('../utils/logger');
const { redisClient } = require('../config/redis');

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const ADMIN_IP_ALLOWLIST = (process.env.ADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const ADMIN_LOOKUP_RATE_LIMIT = Number(process.env.ADMIN_LOOKUP_RATE_LIMIT || 20);
const ADMIN_LOOKUP_WINDOW_MS = Number(process.env.ADMIN_LOOKUP_WINDOW_MS || 60 * 1000);

if (!ADMIN_API_KEY) {
  throw new Error('ADMIN_API_KEY must be configured for admin routes');
}

const normalizeIp = (ipAddress) => {
  if (!ipAddress) {
    return 'unknown';
  }
  if (ipAddress.startsWith('::ffff:')) {
    return ipAddress.substring(7);
  }
  return ipAddress;
};

const adminRateLimiter = rateLimit({
  windowMs: ADMIN_LOOKUP_WINDOW_MS,
  max: ADMIN_LOOKUP_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = normalizeIp(req.ip || req.connection?.remoteAddress || 'unknown');
    const apiKey = req.headers['x-api-key'] || 'missing';
    return `${ip}:${apiKey}`;
  },
  handler: (req, res, next, options) => {
    logger.warn('Admin lookup rate limit exceeded', {
      ip: normalizeIp(req.ip || req.connection?.remoteAddress || 'unknown'),
      path: req.originalUrl,
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
    prefix: 'rate:admin-lookup',
  }),
});

const maskApiKeyForLog = (key) => {
  if (!key) {
    return 'missing';
  }
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 10);
};

const ipAllowed = (ip) => {
  if (ADMIN_IP_ALLOWLIST.length === 0) {
    return true;
  }
  if (!ip) {
    return false;
  }
  const normalized = normalizeIp(ip);
  if (isIP(ip) === 0 && isIP(normalized) === 0) {
    return false;
  }
  return ADMIN_IP_ALLOWLIST.includes(ip) || ADMIN_IP_ALLOWLIST.includes(normalized);
};

const adminAuthMiddleware = [
  adminRateLimiter,
  (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    const rawIp = req.ip || req.connection?.remoteAddress || 'unknown';
    const requestIp = normalizeIp(rawIp);

    logger.info('Admin lookup attempt', {
      path: req.originalUrl,
      ip: requestIp,
      apiKeyHash: maskApiKeyForLog(providedKey),
    });

    if (!providedKey || providedKey !== ADMIN_API_KEY) {
      logger.warn('Invalid admin API key', {
        ip: requestIp,
        apiKeyHash: maskApiKeyForLog(providedKey),
      });
      return next(new ApiError({
        statusCode: 401,
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Invalid administrative credentials',
        requestId: req.requestId,
      }));
    }

    if (!ipAllowed(requestIp)) {
      logger.warn('Admin lookup blocked by IP allowlist', {
        ip: requestIp,
      });
      return next(new ApiError({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
        message: 'IP not allowed for administrative access',
        requestId: req.requestId,
      }));
    }

    return next();
  },
];

module.exports = adminAuthMiddleware;
