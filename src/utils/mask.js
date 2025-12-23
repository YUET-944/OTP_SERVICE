const maskEmail = (identifier = '') => {
  if (!identifier || typeof identifier !== 'string') {
    return '***';
  }

  const [local = '', domain = ''] = identifier.split('@');
  if (!domain) {
    return '***';
  }

  if (local.length <= 2) {
    return `${local.charAt(0) || ''}***@${domain}`;
  }

  const firstChar = local.charAt(0);
  const lastChar = local.charAt(local.length - 1);
  return `${firstChar}***${lastChar}@${domain}`;
};

const maskPhone = (identifier = '') => {
  if (!identifier || typeof identifier !== 'string') {
    return '***';
  }

  const cleaned = identifier.replace(/\s+/g, '');
  if (cleaned.length <= 4) {
    const prefix = cleaned.charAt(0) || '';
    const suffix = cleaned.charAt(cleaned.length - 1) || '';
    return `${prefix}***${suffix}`;
  }

  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-2);
  return `${prefix}******${suffix}`;
};

const maskIdentifier = (channel, identifier) => {
  const normalizedChannel = (channel || '').toString().trim().toLowerCase();
  if (normalizedChannel === 'email') {
    return maskEmail(identifier);
  }
  if (normalizedChannel === 'sms') {
    return maskPhone(identifier);
  }
  return '***';
};

const maskOtp = (otp) => {
  if (otp === undefined || otp === null) {
    return undefined;
  }
  const stringOtp = String(otp);
  if (stringOtp.length <= 2) {
    return '*'.repeat(stringOtp.length);
  }
  return `${'*'.repeat(stringOtp.length - 2)}${stringOtp.slice(-2)}`;
};

module.exports = {
  maskEmail,
  maskPhone,
  maskIdentifier,
  maskOtp,
};
