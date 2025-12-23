const logger = require('../utils/logger');
const { isMockDeliveryMode } = require('../config/env');
const { logMockDelivery } = require('../utils/deliveryMock');
const { maskIdentifier } = require('../utils/mask');

const MOCK_MODE = isMockDeliveryMode();
const emailClient = MOCK_MODE ? null : require('../config/email');

const EMAIL_MAX_RETRIES = Number(process.env.EMAIL_MAX_RETRIES ?? 2);
const EMAIL_RETRY_DELAY_MS = Number(process.env.EMAIL_RETRY_DELAY_MS ?? 1000);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendEmailOtp = async ({ to, subject, text, requestId, purpose, otp }) => {
  if (MOCK_MODE) {
    const response = logMockDelivery({
      channel: 'email',
      identifier: to,
      otp,
      requestId,
      purpose,
    });
    return { success: true, response, attempts: 1, mock: true };
  }

  let attempt = 0;
  let lastError;
  const maxAttempts = EMAIL_MAX_RETRIES + 1;
  const providerName = (process.env.EMAIL_PROVIDER || 'sendgrid').toLowerCase();

  while (attempt < maxAttempts) {
    try {
      const response = await emailClient.send({ to, subject, text });
      logger.info('Email OTP sent', {
        channel: 'email',
        requestId,
        purpose,
        sentTo: maskIdentifier('email', to),
        attempt: attempt + 1,
        response,
      });
      return {
        success: true,
        response: {
          provider: providerName,
          messageId: response?.messageId || response?.MessageId,
          raw: response,
        },
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      attempt += 1;
      logger.error('Email OTP send failed', {
        channel: 'email',
        requestId,
        attempt,
        sentTo: maskIdentifier('email', to),
        error: error.message,
      });
      if (attempt >= maxAttempts) {
        break;
      }
      await wait(EMAIL_RETRY_DELAY_MS * attempt);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
  };
};

module.exports = {
  sendEmailOtp,
};
