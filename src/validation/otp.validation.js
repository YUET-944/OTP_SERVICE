const Joi = require('joi');
const { OTP_LENGTH } = require('../utils/crypto');

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const PURPOSE_REGEX = /^[a-zA-Z0-9_.-]{3,50}$/;

const generateOtpSchema = Joi.object({
  identifier: Joi.when('channel', {
    is: 'email',
    then: Joi.string().email().lowercase().trim().required(),
    otherwise: Joi.string().pattern(PHONE_REGEX).trim().required(),
  }),
  channel: Joi.string().valid('email', 'sms').required(),
  purpose: Joi.string().pattern(PURPOSE_REGEX).required(),
  fallback_identifier: Joi.string()
    .when('channel', {
      is: 'email',
      then: Joi.string().pattern(PHONE_REGEX).trim(),
      otherwise: Joi.string().email().lowercase().trim(),
    })
    .optional(),
});

const verifyOtpSchema = Joi.object({
  identifier: Joi.when('channel', {
    is: 'email',
    then: Joi.string().email().lowercase().trim().required(),
    otherwise: Joi.string().pattern(PHONE_REGEX).trim().required(),
  }),
  channel: Joi.string().valid('email', 'sms').required(),
  purpose: Joi.string().pattern(PURPOSE_REGEX).required(),
  otp: Joi.string()
    .length(OTP_LENGTH)
    .pattern(/^\d+$/)
    .required(),
});

module.exports = {
  generateOtpSchema,
  verifyOtpSchema,
};
