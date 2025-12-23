const { EMAIL_ENABLED, SMS_ENABLED } = require('./env');

const REQUIRED_ENV = {
  global: [
    'OTP_SECRET',
    'JWT_SECRET',
    'PG_HOST',
    'PG_PORT',
    'PG_DATABASE',
    'PG_USER',
    'PG_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'ADMIN_API_KEY',
  ],
  email: {
    sendgrid: ['SENDGRID_API_KEY', 'EMAIL_FROM'],
    ses: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'EMAIL_FROM'],
  },
  sms: {
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    sns: ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
};

const collectMissingVars = (vars, context) => {
  return vars
    .filter((variable) => !process.env[variable])
    .map((variable) => `${variable} is required${context ? ` (${context})` : ''}`);
};

const ensureStrongSecret = (secretName) => {
  const value = process.env[secretName];
  if (!value || value.length < 16 || value.includes('replace') || value.includes('change')) {
    return [`${secretName} must be set to a strong value (16+ characters)`];
  }
  return [];
};

const getProviderRequirements = (providerKey, providersMap, enabled) => {
  if (!enabled) {
    return [];
  }

  const provider = (process.env[providerKey] || Object.keys(providersMap)[0]).toLowerCase();
  const required = providersMap[provider];
  if (!required) {
    return [`Unsupported ${providerKey.toLowerCase()} value: ${provider}`];
  }

  return collectMissingVars(required, `${providerKey}=${provider}`);
};

const validateConfiguration = () => {
  const errors = [];

  errors.push(...collectMissingVars(REQUIRED_ENV.global, 'global configuration'));
  errors.push(...ensureStrongSecret('OTP_SECRET'));
  errors.push(...ensureStrongSecret('JWT_SECRET'));
  errors.push(...getProviderRequirements('EMAIL_PROVIDER', REQUIRED_ENV.email, EMAIL_ENABLED));
  errors.push(...getProviderRequirements('SMS_PROVIDER', REQUIRED_ENV.sms, SMS_ENABLED));

  return errors;
};

module.exports = {
  validateConfiguration,
};
