const logger = require('./logger');
const { EMAIL_ENABLED, SMS_ENABLED } = require('../config/env');
const { validateConfiguration } = require('../config/validation');

const validateSecrets = () => {
  const errors = validateConfiguration();

  if (errors.length > 0) {
    const message = `Configuration validation failed: ${errors.join('; ')}`;
    logger.error(message);
    throw new Error(message);
  }

  logger.info('Configuration validation succeeded', {
    emailEnabled: EMAIL_ENABLED,
    smsEnabled: SMS_ENABLED,
    emailProvider: process.env.EMAIL_PROVIDER || 'sendgrid',
    smsProvider: process.env.SMS_PROVIDER || 'twilio',
  });
};

module.exports = {
  validateSecrets,
};
