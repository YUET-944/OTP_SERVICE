const logger = require('../utils/logger');
const { ApiError } = require('../utils/errors');
const ERROR_CODES = require('../utils/errorCodes');

const notFoundHandler = (req, res, next) => {
  next(new ApiError({
    statusCode: 404,
    code: ERROR_CODES.NOT_FOUND,
    message: 'Resource not found',
    requestId: req.requestId,
  }));
};

const errorHandler = (err, req, res, next) => {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError && err.statusCode ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';
  const code = isApiError && err.code ? err.code : ERROR_CODES.INTERNAL_ERROR;
  const requestId = err.requestId || req.requestId;
  const details = err.details;

  if (!isApiError) {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      requestId,
    });
  } else {
    logger.warn('API error', {
      statusCode,
      message,
      code,
      details,
      requestId,
    });
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
    ...(details ? { details } : {}),
    ...(requestId ? { request_id: requestId } : {}),
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
