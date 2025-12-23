const logger = require('./logger');
const { normalizeChannel } = require('../config/env');
const { maskIdentifier, maskOtp } = require('./mask');

const logMockDelivery = ({ channel, identifier, otp, requestId, purpose }) => {
  const normalizedChannel = normalizeChannel(channel);
  const maskedIdentifier = maskIdentifier(normalizedChannel, identifier);
  const maskedOtp = maskOtp(otp);

  const payload = {
    channel: normalizedChannel,
    requestId,
    sent_to: maskedIdentifier,
    purpose,
    otp: maskedOtp,
  };

  logger.info('[MOCK_DELIVERY]', payload);

  return {
    provider: 'mock',
    messageId: `mock-${normalizedChannel}-${Date.now()}`,
    logged: true,
    ...payload,
  };
};

module.exports = {
  logMockDelivery,
};
