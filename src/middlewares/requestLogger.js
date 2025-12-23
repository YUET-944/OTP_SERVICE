'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const createRequestLogger = () => (req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startTime = process.hrtime.bigint();
  const { method, originalUrl } = req;

  logger.info('Incoming request', {
    requestId,
    method,
    path: originalUrl,
  });

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1e6;
    logger.info('Request completed', {
      requestId,
      method,
      path: originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
};

module.exports = {
  createRequestLogger,
};
