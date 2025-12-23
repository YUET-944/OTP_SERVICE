const logger = require('../utils/logger');
const { isMockDeliveryMode } = require('../config/env');
const { logMockDelivery } = require('../utils/deliveryMock');
const { maskIdentifier } = require('../utils/mask');

const MOCK_MODE = isMockDeliveryMode();
const smsClient = MOCK_MODE ? null : require('../config/sms');

const SMS_MAX_RETRIES = Number(process.env.SMS_MAX_RETRIES ?? 2);
const SMS_RETRY_DELAY_MS = Number(process.env.SMS_RETRY_DELAY_MS ?? 1000);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendSmsOtp = async ({ to, message, requestId, purpose, otp }) => {
  if (MOCK_MODE) {
    const response = logMockDelivery({
      channel: 'sms',
      identifier: to,
      otp,
      requestId,
      purpose,
    });
    return { success: true, response, attempts: 1, mock: true };
  }

  let attempt = 0;
  let lastError;
  const maxAttempts = SMS_MAX_RETRIES + 1;

  while (attempt < maxAttempts) {
    try {
      const response = await smsClient.send({ to, message });
      logger.info('SMS OTP sent', {
        channel: 'sms',
        requestId,
        purpose,
        sentTo: maskIdentifier('sms', to),
        attempt: attempt + 1,
        response,
      });
      return { success: true, response, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      attempt += 1;
      logger.error('SMS OTP send failed', {
        channel: 'sms',
        requestId,
        attempt,
        sentTo: maskIdentifier('sms', to),
        error: error.message,
      });
      if (attempt >= maxAttempts) {
        break;
      }
      await wait(SMS_RETRY_DELAY_MS * attempt);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt,
  };
};

module.exports = {
  sendSmsOtp,
};
