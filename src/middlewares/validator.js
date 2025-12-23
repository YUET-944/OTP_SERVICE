const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');

const validate = (schema) => (req, _res, next) => {
  const options = {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
    convert: true,
  };

  const { error, value } = schema.validate(req.body, options);

  if (error) {
    const details = error.details.map((detail) => ({
      message: detail.message,
      path: detail.path.join('.'),
      type: detail.type,
    }));

    return next(new ApiError({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation error',
      details,
      requestId: req.requestId,
    }));
  }

  req.body = value;
  return next();
};

module.exports = {
  validate,
};
