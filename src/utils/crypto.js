const crypto = require('crypto');

const OTP_LENGTH = Number(process.env.OTP_LENGTH) || 6;
const OTP_SECRET = process.env.OTP_SECRET || 'change_this_secret';

const generateNumericOtp = () => {
  const otp = crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
  return otp;
};

const hashOtp = (otp) => {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(otp)
    .digest('hex');
};

const hashIdentifier = (identifier) => {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(identifier)
    .digest('hex');
};

module.exports = {
  generateNumericOtp,
  hashOtp,
  hashIdentifier,
  OTP_LENGTH,
  OTP_SECRET,
};
