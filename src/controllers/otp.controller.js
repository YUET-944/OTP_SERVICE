const { validate: validateUuid } = require('uuid');
const logger = require('../utils/logger');
const { generateOtp, verifyOtp } = require('../services/otp.service');
const { isChannelEnabled } = require('../config/env');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');
const { getOtpLogByRequestId } = require('../models/otpLog.model');
const { maskIdentifier } = require('../utils/mask');
const { OTP_STATUS } = require('../utils/constants');
const { OTP_TTL_SECONDS } = require('../utils/crypto');

const generateOtpController = async (req, res, next) => {
  try {
    const { identifier, channel, purpose, fallback_identifier: fallbackIdentifier } = req.body;
    const ipAddress = req.ip;

    if (!isChannelEnabled(channel)) {
      throw new ApiError({
        statusCode: 503,
        code: ERROR_CODES.CHANNEL_DISABLED,
        message: `${channel} channel is currently disabled`,
        requestId: req.requestId,
      });
    }

    const response = await generateOtp({
      identifier,
      channel,
      purpose,
      fallbackIdentifier,
      ipAddress,
      requestId: req.requestId,
    });

    logger.debug('OTP generation response', {
      requestId: response.request_id,
      channel: response.channel,
      fallbackUsed: response.fallback_used,
    });

    res.status(201).json({
      request_id: response.request_id,
      status: response.status,
      channel: response.channel,
      fallback_used: response.fallback_used,
      expires_in: response.expires_in,
    });
  } catch (error) {
    next(error);
  }
};

const verifyOtpController = async (req, res, next) => {
  try {
    const {
      identifier,
      channel,
      purpose,
      otp,
    } = req.body;

    if (!isChannelEnabled(channel)) {
      throw new ApiError({
        statusCode: 503,
        code: ERROR_CODES.CHANNEL_DISABLED,
        message: `${channel} channel is currently disabled`,
        requestId: req.requestId,
      });
    }

    const result = await verifyOtp({ identifier, channel, purpose, otp, requestId: req.requestId });

    res.status(200).json({
      verified: result.verified,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

const lookupOtpRequest = async (req, res, next) => {
  try {
    const { request_id: requestId } = req.query;

    if (!requestId || !validateUuid(requestId)) {
      throw new ApiError({
        statusCode: 400,
        code: ERROR_CODES.INVALID_REQUEST,
        message: 'Invalid request_id parameter',
        requestId: req.requestId,
      });
    }

    const logRecord = await getOtpLogByRequestId(requestId);

    if (!logRecord) {
      throw new ApiError({
        statusCode: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'OTP request not found',
        requestId: req.requestId,
      });
    }

    const maskedIdentifier = maskIdentifier(logRecord.channel, logRecord.identifier);
    const createdAt = logRecord.created_at ? new Date(logRecord.created_at) : null;
    const updatedAt = logRecord.updated_at ? new Date(logRecord.updated_at) : null;
    const expiresAt = createdAt
      ? new Date(createdAt.getTime() + OTP_TTL_SECONDS * 1000)
      : null;
    const now = new Date();

    const lifecycle = ['created'];
    if ([OTP_STATUS.SENT, OTP_STATUS.VERIFIED].includes(logRecord.status)) {
      lifecycle.push('sent');
    }
    if (logRecord.verified) {
      lifecycle.push('verified');
    } else if (expiresAt && expiresAt < now) {
      lifecycle.push('expired');
    }
    if (logRecord.status === OTP_STATUS.FAILED) {
      lifecycle.push('delivery_failed');
    }

    const providerResponse = logRecord.provider_response;
    const provider = providerResponse?.provider
      || (logRecord.channel === 'email'
        ? (process.env.EMAIL_PROVIDER || 'sendgrid')
        : (process.env.SMS_PROVIDER || 'twilio'));

    const toIsoString = (value) => {
      if (!value) {
        return null;
      }

      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) {
        return null;
      }

      return date.toISOString();
    };

    const responsePayload = {
      request_id: logRecord.request_id,
      identifier: maskedIdentifier,
      channel: logRecord.channel,
      status: logRecord.status,
      attempts: logRecord.verification_attempts ?? 0,
      max_attempts: Number(process.env.OTP_MAX_ATTEMPTS) || 3,
      delivery_attempts: logRecord.delivery_attempts ?? 0,
      purpose: logRecord.purpose,
      provider,
      created_at: toIsoString(createdAt),
      updated_at: toIsoString(updatedAt),
      verified_at: logRecord.verified ? toIsoString(updatedAt) : null,
      expires_at: toIsoString(expiresAt),
      lifecycle,
      fallback_channel: logRecord.fallback_channel,
    };

    logger.info('Admin OTP lookup success', {
      requestId,
      identifier: maskedIdentifier,
      channel: logRecord.channel,
    });

    res.status(200).json(responsePayload);
  } catch (error) {
    if (error instanceof ApiError) {
      logger.warn('Admin OTP lookup failed', {
        requestId: req.query.request_id,
        error: error.message,
      });
    } else {
      logger.error('Unexpected error during admin OTP lookup', {
        requestId: req.query.request_id,
        error: error.message,
      });
    }
    next(error);
  }
};

module.exports = {
  generateOtpController,
  verifyOtpController,
  lookupOtpRequest,
};
