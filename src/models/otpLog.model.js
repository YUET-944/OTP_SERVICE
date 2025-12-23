const logger = require('../utils/logger');
const { query } = require('../config/database');
const { OTP_STATUS } = require('../utils/constants');

const ensureOtpLogsTable = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS otp_logs (
        id SERIAL PRIMARY KEY,
        request_id UUID UNIQUE NOT NULL,
        identifier TEXT NOT NULL,
        identifier_hash TEXT NOT NULL,
        channel VARCHAR(16) NOT NULL,
        fallback_channel VARCHAR(16),
        purpose VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        delivery_attempts INTEGER DEFAULT 0,
        provider_message_id TEXT,
        provider_response JSONB,
        ip_address INET,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        verified BOOLEAN,
        verification_attempts INTEGER DEFAULT 0,
        verification_failure_reason TEXT
      );
    `);

    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_otp_logs_updated_at'
        ) THEN
          CREATE TRIGGER trigger_update_otp_logs_updated_at
          BEFORE UPDATE ON otp_logs
          FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
        END IF;
      END;
      $$;
    `);
  } catch (error) {
    logger.error('Failed to ensure otp_logs table', { error: error.message });
    throw error;
  }
};

const createOtpLog = async ({
  requestId,
  identifier,
  identifierHash,
  channel,
  fallbackChannel,
  purpose,
  status,
  ipAddress,
}) => {
  const queryText = `
    INSERT INTO otp_logs (
      request_id,
      identifier,
      identifier_hash,
      channel,
      fallback_channel,
      purpose,
      status,
      ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (request_id) DO UPDATE SET
      identifier = EXCLUDED.identifier,
      identifier_hash = EXCLUDED.identifier_hash,
      channel = EXCLUDED.channel,
      fallback_channel = EXCLUDED.fallback_channel,
      purpose = EXCLUDED.purpose,
      status = EXCLUDED.status,
      ip_address = EXCLUDED.ip_address,
      updated_at = NOW()
    RETURNING *;
  `;

  const params = [
    requestId,
    identifier,
    identifierHash,
    channel,
    fallbackChannel,
    purpose,
    status,
    ipAddress,
  ];

  const { rows } = await query(queryText, params);
  return rows[0];
};

const updateOtpDeliveryStatus = async ({
  requestId,
  status,
  deliveryAttempts,
  providerMessageId,
  providerResponse,
  fallbackUsed,
  fallbackChannel,
}) => {
  const queryText = `
    UPDATE otp_logs
    SET
      status = $2,
      delivery_attempts = $3,
      provider_message_id = COALESCE($4, provider_message_id),
      provider_response = COALESCE($5::jsonb, provider_response),
      fallback_channel = CASE WHEN $6 THEN $7 ELSE fallback_channel END,
      updated_at = NOW()
    WHERE request_id = $1
    RETURNING *;
  `;

  const params = [
    requestId,
    status,
    deliveryAttempts,
    providerMessageId,
    providerResponse ? JSON.stringify(providerResponse) : null,
    fallbackUsed,
    fallbackChannel,
  ];

  const { rows } = await query(queryText, params);
  return rows[0];
};

const updateOtpVerification = async ({
  requestId,
  verified,
  verificationAttempts,
  failureReason,
}) => {
  const queryText = `
    UPDATE otp_logs
    SET
      verified = $2,
      verification_attempts = $3,
      verification_failure_reason = $4,
      status = CASE WHEN $2 THEN '${OTP_STATUS.VERIFIED}' ELSE status END,
      updated_at = NOW()
    WHERE request_id = $1
    RETURNING *;
  `;

  const params = [
    requestId,
    verified,
    verificationAttempts,
    failureReason,
  ];

  const { rows } = await query(queryText, params);
  return rows[0];
};

const getOtpLogByRequestId = async (requestId) => {
  const queryText = `
    SELECT
      request_id,
      identifier,
      identifier_hash,
      channel,
      fallback_channel,
      purpose,
      status,
      delivery_attempts,
      provider_message_id,
      provider_response,
      ip_address,
      created_at,
      updated_at,
      verified,
      verification_attempts,
      verification_failure_reason
    FROM otp_logs
    WHERE request_id = $1
    LIMIT 1;
  `;

  const { rows } = await query(queryText, [requestId]);
  return rows[0] || null;
};

module.exports = {
  ensureOtpLogsTable,
  createOtpLog,
  updateOtpDeliveryStatus,
  updateOtpVerification,
  getOtpLogByRequestId,
};
