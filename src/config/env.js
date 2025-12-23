const truthyValues = new Set(['true', '1', 'yes', 'y', 'on']);
const falsyValues = new Set(['false', '0', 'no', 'n', 'off']);

const parseBoolean = (value, defaultValue = true) => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return defaultValue;
};

const EMAIL_ENABLED = parseBoolean(process.env.EMAIL_ENABLED, true);
const SMS_ENABLED = parseBoolean(process.env.SMS_ENABLED, true);
const DELIVERY_MODE = (process.env.DELIVERY_MODE || 'real').trim().toLowerCase();
const isMockDeliveryMode = () => DELIVERY_MODE === 'mock';

const normalizeChannel = (channel) => {
  if (!channel) {
    return '';
  }
  return String(channel).trim().toLowerCase();
};

const isChannelEnabled = (channel) => {
  const normalized = normalizeChannel(channel);
  if (normalized === 'email') {
    return EMAIL_ENABLED;
  }
  if (normalized === 'sms') {
    return SMS_ENABLED;
  }
  return false;
};

module.exports = {
  parseBoolean,
  EMAIL_ENABLED,
  SMS_ENABLED,
  DELIVERY_MODE,
  isMockDeliveryMode,
  normalizeChannel,
  isChannelEnabled,
};
