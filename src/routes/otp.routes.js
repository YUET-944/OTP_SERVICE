const express = require('express');
const { validate } = require('../middlewares/validator');
const {
  emailRateLimiter,
  smsRateLimiter,
  ipRateLimiter,
} = require('../middlewares/rateLimiter');
const {
  generateOtpSchema,
  verifyOtpSchema,
} = require('../validation/otp.validation');
const {
  generateOtpController,
  verifyOtpController,
  lookupOtpRequest,
} = require('../controllers/otp.controller');
const { normalizeChannel, isChannelEnabled } = require('../config/env');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');
const adminAuthMiddleware = require('../middlewares/adminAuthMiddleware');

const createOtpRouter = () => {
  const router = express.Router();

  router.use(ipRateLimiter);

  router.post(
    '/generate',
    (req, res, next) => {
      const channel = normalizeChannel(req.body.channel);
      if (!isChannelEnabled(channel)) {
        return next(new ApiError({
          statusCode: 503,
          code: ERROR_CODES.CHANNEL_DISABLED,
          message: `${channel} channel is currently disabled`,
          requestId: req.requestId,
        }));
      }

      if (channel === 'email') {
        return emailRateLimiter(req, res, next);
      }
      if (channel === 'sms') {
        return smsRateLimiter(req, res, next);
      }
      return next(new ApiError({
        statusCode: 400,
        code: ERROR_CODES.INVALID_REQUEST,
        message: 'Unsupported channel',
        requestId: req.requestId,
      }));
    },
    validate(generateOtpSchema),
    generateOtpController,
  );

  router.post(
    '/verify',
    validate(verifyOtpSchema),
    verifyOtpController,
  );

  return router;
};

const createAdminOtpRouter = () => {
  const router = express.Router();

  router.use(adminAuthMiddleware);
  router.get('/lookup', lookupOtpRequest);

  return router;
};

module.exports = {
  createOtpRouter,
  createAdminOtpRouter,
};
