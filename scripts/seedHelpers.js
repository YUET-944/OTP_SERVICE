const { v4: uuidv4 } = require('uuid');
const { redisClient } = require('../src/config/redis');
const { OTP_STATUS } = require('../src/utils/constants');
const {
  generateNumericOtp,
  hashOtp,
  hashIdentifier,
  OTP_LENGTH,
} = require('../src/utils/crypto');
const { maskIdentifier, maskOtp } = require('../src/utils/mask');
const { createOtpLog } = require('../src/models/otpLog.model');
const { normalizeChannel } = require('../src/config/env');
const logger = require('../src/utils/logger');

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 300;
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS) || 3;

const normalizeIdentifierForChannel = (channel, identifier) => {
  if (!identifier) {
    return '';
  }
  const trimmed = identifier.trim();
  if (channel === 'email') {
    return trimmed.toLowerCase();
  }
  return trimmed;
};

const getRecordKey = (requestId) => `otp:req:${requestId}`;
const getMapKey = (purpose, identifierHash) => `otp:map:${purpose}:${identifierHash}`;

const persistRecord = async (record, ttlSeconds) => {
  const pipeline = redisClient.multi();
  pipeline.set(getRecordKey(record.requestId), JSON.stringify(record), 'EX', ttlSeconds);
  record.identifiers.forEach(({ hash }) => {
    const mapKey = getMapKey(record.purpose, hash);
    pipeline.set(mapKey, record.requestId, 'EX', ttlSeconds);
  });
  await pipeline.exec();
};

const seedEntry = async ({
  type,
  identifier,
  purpose,
  preGeneratedOtp,
  ipAddress = '127.0.0.1',
}) => {
  const channel = normalizeChannel(type);
  if (!channel) {
    logger.warn('Skipping seed entry with unknown channel', { type });
    return null;
  }

  const normalizedIdentifier = normalizeIdentifierForChannel(channel, identifier);
  const identifierHash = hashIdentifier(normalizedIdentifier);
  const otp = preGeneratedOtp || generateNumericOtp();
  const hashedOtp = hashOtp(otp);
  const requestId = uuidv4();

  const record = {
    requestId,
    purpose,
    hashedOtp,
    identifiers: [
      {
        hash: identifierHash,
        channel,
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
    channel,
    fallbackChannel: null,
    purpose,
    status: OTP_STATUS.PENDING,
    ipAddress,
  });

  return {
    requestId,
    channel,
    purpose,
    identifier: normalizedIdentifier,
    maskedIdentifier: maskIdentifier(channel, normalizedIdentifier),
    otp,
    maskedOtp: maskOtp(otp),
  };
};

const seedEntries = async (entries = []) => {
  const summaries = [];
  for (const entry of entries) {
    // eslint-disable-next-line no-await-in-loop
    const seeded = await seedEntry(entry);
    if (seeded) {
      summaries.push(seeded);
    }
  }
  return summaries;
};

module.exports = {
  seedEntries,
  seedEntry,
  normalizeIdentifierForChannel,
  getRecordKey,
  persistRecord,
};
