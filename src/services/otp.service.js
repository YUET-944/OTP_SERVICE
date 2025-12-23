const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { redisClient } = require('../config/redis');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');
const {
  generateNumericOtp,
  hashOtp,
  hashIdentifier,
  OTP_LENGTH,
} = require('../utils/crypto');
const { OTP_STATUS } = require('../utils/constants');
const { isChannelEnabled, normalizeChannel } = require('../config/env');
const { sendEmailOtp } = require('./email.service');
const { sendSmsOtp } = require('./sms.service');
const { signToken } = require('../utils/jwt');
const {
  createOtpLog,
  updateOtpDeliveryStatus,
  updateOtpVerification,
} = require('../models/otpLog.model');

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 300;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 3;

const getRedisRecordKey = (requestId) => `otp:req:${requestId}`;
const getRedisMapKey = (purpose, identifierHash) => `otp:map:${purpose}:${identifierHash}`;

const normalizeIdentifier = (channel, identifier) => {
  if (!identifier) return identifier;
  const trimmed = identifier.trim();
  if (channel === 'email') {
    return trimmed.toLowerCase();
  }
  return trimmed;
};

const persistRecord = async (record, ttlSeconds) => {
  const recordKey = getRedisRecordKey(record.requestId);
  let ttl = ttlSeconds;

  if (!ttl) {
    const currentTtl = await redisClient.ttl(recordKey);
    ttl = currentTtl > 0 ? currentTtl : OTP_TTL_SECONDS;
  }

  const pipeline = redisClient.multi();
  pipeline.set(recordKey, JSON.stringify(record), 'EX', ttl);
  record.identifiers.forEach(({ hash }) => {
    const mapKey = getRedisMapKey(record.purpose, hash);
    pipeline.set(mapKey, record.requestId, 'EX', ttl);
  });
  await pipeline.exec();
};

const deleteRecordAndMappings = async (record) => {
  const recordKey = getRedisRecordKey(record.requestId);
  const pipeline = redisClient.multi();
  pipeline.del(recordKey);
  record.identifiers.forEach(({ hash }) => {
    const mapKey = getRedisMapKey(record.purpose, hash);
    pipeline.del(mapKey);
  });
  await pipeline.exec();
};

const buildEmailContent = ({ otp, purpose }) => {
  const ttlMinutes = Math.ceil(OTP_TTL_SECONDS / 60);
  const subject = `Your ${purpose} verification code`;
  const text = `Your OTP is ${otp}. It expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.`;
  return { subject, text };
};

const buildSmsContent = ({ otp, purpose }) => {
  const ttlMinutes = Math.ceil(OTP_TTL_SECONDS / 60);
  return `Use ${otp} as your ${purpose} code. Expires in ${ttlMinutes} minute${ttlMinutes === 1 ? '' : 's'}.`;
};

const deliverOtp = async ({
  channel,
  identifier,
  purpose,
  otp,
  requestId,
}) => {
  if (channel === 'email') {
    const { subject, text } = buildEmailContent({ otp, purpose });
    return sendEmailOtp({
      to: identifier,
      subject,
      text,
      requestId,
      purpose,
      otp,
    });
  }

  const message = buildSmsContent({ otp, purpose });
  return sendSmsOtp({
    to: identifier,
    message,
    requestId,
    purpose,
    otp,
  });
};

const getRequestRecord = async ({ purpose, identifierHash }) => {
  const mapKey = getRedisMapKey(purpose, identifierHash);
  const requestId = await redisClient.get(mapKey);
  if (!requestId) {
    return null;
  }
  const recordKey = getRedisRecordKey(requestId);
  const recordRaw = await redisClient.get(recordKey);
  if (!recordRaw) {
    return null;
  }
  return JSON.parse(recordRaw);
};

const generateOtp = async ({
  identifier,
  channel,
  purpose,
  fallbackIdentifier,
  ipAddress,
  requestId: contextRequestId,
}) => {
  const normalizedChannel = normalizeChannel(channel);
  if (!isChannelEnabled(normalizedChannel)) {
    throw new ApiError({
      statusCode: 503,
      code: ERROR_CODES.CHANNEL_DISABLED,
      message: `${normalizedChannel} channel is currently disabled`,
      requestId: contextRequestId,
    });
  }

  const normalizedIdentifier = normalizeIdentifier(normalizedChannel, identifier);
  const identifierHash = hashIdentifier(normalizedIdentifier);
  const existingRecord = await getRequestRecord({ purpose, identifierHash });
  const requestId = uuidv4();
  const otp = generateNumericOtp();
  const hashedOtp = hashOtp(otp);

  if (existingRecord) {
    logger.info('Existing OTP record superseded by new request', {
      oldRequestId: existingRecord.requestId,
      newRequestId: requestId,
      purpose,
      channel,
    });
    await deleteRecordAndMappings(existingRecord);
  }

  const record = {
    requestId,
    purpose,
    hashedOtp,
    identifiers: [
      {
        hash: identifierHash,
        channel: normalizedChannel,
        value: normalizedIdentifier,
      },
    ],
    maxAttempts: OTP_MAX_ATTEMPTS,
    attempts: 0,
    locked: false,
    fallbackUsed: false,
    fallbackChannel: null,
    otpLength: OTP_LENGTH,
  };

  await persistRecord(record, OTP_TTL_SECONDS);

  await createOtpLog({
    requestId,
    identifier: normalizedIdentifier,
    identifierHash,
    channel: normalizedChannel,
    fallbackChannel: null,
    purpose,
    status: OTP_STATUS.PENDING,
    ipAddress,
  });

  const deliveryResult = await deliverOtp({
    channel: normalizedChannel,
    identifier: normalizedIdentifier,
    purpose,
    otp,
    requestId,
  });

  if (!deliveryResult.success) {
    logger.warn('Primary OTP delivery failed', {
      requestId,
      channel: normalizedChannel,
      purpose,
      attempts: deliveryResult.attempts,
      error: deliveryResult.error?.message,
    });

    await updateOtpDeliveryStatus({
      requestId,
      status: OTP_STATUS.FAILED,
      deliveryAttempts: deliveryResult.attempts,
      providerMessageId: null,
      providerResponse: deliveryResult.error
        ? { message: deliveryResult.error.message }
        : null,
      fallbackUsed: false,
      fallbackChannel: null,
    });

    const fallbackChannel = normalizedChannel === 'email' ? 'sms' : 'email';
    if (!isChannelEnabled(fallbackChannel)) {
      throw new ApiError({
        statusCode: 502,
        code: ERROR_CODES.DELIVERY_FAILED,
        message: `Fallback channel ${fallbackChannel} unavailable`,
        requestId: contextRequestId,
      });
    }
    const normalizedFallback = normalizeIdentifier(fallbackChannel, fallbackIdentifier);

    if (!normalizedFallback) {
      throw new ApiError({
        statusCode: 502,
        code: ERROR_CODES.DELIVERY_FAILED,
        message: 'Failed to deliver OTP',
        requestId: contextRequestId,
      });
    }

    const fallbackDeliveryResult = await deliverOtp({
      channel: fallbackChannel,
      identifier: normalizedFallback,
      purpose,
      otp,
      requestId,
    });

    if (!fallbackDeliveryResult.success) {
      await updateOtpDeliveryStatus({
        requestId,
        status: OTP_STATUS.FAILED,
        deliveryAttempts: deliveryResult.attempts + fallbackDeliveryResult.attempts,
        providerMessageId: null,
        providerResponse: fallbackDeliveryResult.error
          ? { message: fallbackDeliveryResult.error.message }
          : null,
        fallbackUsed: true,
        fallbackChannel,
      });

      throw new ApiError({
        statusCode: 502,
        code: ERROR_CODES.DELIVERY_FAILED,
        message: 'Failed to deliver OTP',
        requestId: contextRequestId,
      });
    }

    record.fallbackUsed = true;
    record.fallbackChannel = fallbackChannel;
    const fallbackHash = hashIdentifier(normalizedFallback);

    record.identifiers.push({
      hash: fallbackHash,
      channel: fallbackChannel,
      value: normalizedFallback,
    });

    await persistRecord(record);

    await updateOtpDeliveryStatus({
      requestId,
      status: OTP_STATUS.SENT,
      deliveryAttempts: deliveryResult.attempts + fallbackDeliveryResult.attempts,
      providerMessageId: fallbackDeliveryResult.response?.messageId,
      providerResponse: fallbackDeliveryResult.response || null,
      fallbackUsed: true,
      fallbackChannel,
    });

    return {
      request_id: requestId,
      status: OTP_STATUS.SENT,
      channel: fallbackChannel,
      fallback_used: true,
      expires_in: OTP_TTL_SECONDS,
    };
  }

  await updateOtpDeliveryStatus({
    requestId,
    status: OTP_STATUS.SENT,
    deliveryAttempts: deliveryResult.attempts,
    providerMessageId: deliveryResult.response?.messageId,
    providerResponse: deliveryResult.response || null,
    fallbackUsed: false,
    fallbackChannel: null,
  });

  return {
    request_id: requestId,
    status: OTP_STATUS.SENT,
    channel: normalizedChannel,
    fallback_used: false,
    expires_in: OTP_TTL_SECONDS,
  };
};

const verifyOtp = async ({ identifier, channel, purpose, otp, requestId: contextRequestId }) => {
  const normalizedChannel = normalizeChannel(channel);
  const normalizedIdentifier = normalizeIdentifier(normalizedChannel, identifier);
  const identifierHash = hashIdentifier(normalizedIdentifier);
  const record = await getRequestRecord({ purpose, identifierHash });

  if (!record) {
    throw new ApiError({
      statusCode: 400,
      code: ERROR_CODES.OTP_EXPIRED,
      message: 'OTP expired or not found',
      requestId: contextRequestId,
    });
  }

  if (record.locked) {
    throw new ApiError({
      statusCode: 423,
      code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
      message: 'OTP locked due to too many failed attempts',
      requestId: contextRequestId,
    });
  }

  const identifierEntry = record.identifiers.find(
    (entry) => entry.hash === identifierHash && entry.channel === normalizedChannel,
  );

  if (!identifierEntry) {
    throw new ApiError({
      statusCode: 400,
      code: ERROR_CODES.INVALID_REQUEST,
      message: 'Identifier and channel mismatch for OTP verification',
      requestId: contextRequestId,
    });
  }

  const hashedInputOtp = hashOtp(otp);
  if (hashedInputOtp === record.hashedOtp) {
    await deleteRecordAndMappings(record);

    await updateOtpVerification({
      requestId: record.requestId,
      verified: true,
      verificationAttempts: record.attempts + 1,
      failureReason: null,
    });

    const tokenPayload = {
      sub: identifierEntry.hash,
      purpose,
      requestId: record.requestId,
      channel,
    };

    const token = signToken(tokenPayload);

    logger.info('OTP verified successfully', {
      requestId: record.requestId,
      purpose,
      channel: normalizedChannel,
    });

    return {
      verified: true,
      token,
    };
  }

  record.attempts += 1;

  const locked = record.attempts >= record.maxAttempts;
  if (locked) {
    record.locked = true;
  }

  await persistRecord(record);

  await updateOtpVerification({
    requestId: record.requestId,
    verified: false,
    verificationAttempts: record.attempts,
    failureReason: locked ? 'max_attempts_exceeded' : 'mismatch',
  });

  if (locked) {
    logger.warn('OTP locked after maximum attempts', {
      requestId: record.requestId,
      purpose,
      channel,
    });
    throw new ApiError({
      statusCode: 423,
      code: ERROR_CODES.OTP_ATTEMPTS_EXCEEDED,
      message: 'OTP locked due to too many failed attempts',
      requestId: contextRequestId,
    });
  }

  throw new ApiError({
    statusCode: 400,
    code: ERROR_CODES.INVALID_REQUEST,
    message: 'Invalid OTP',
    requestId: contextRequestId,
  });
};

module.exports = {
  generateOtp,
  verifyOtp,
};
