// Global error handling middleware with Winston logging

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { errorResponse } = require('../utils/response');

const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `NotFound: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let statusCode = 500;
  let message = 'Internal server error';
  let errors;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors || undefined;
  } else if (err?.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    errors = Object.values(err.errors || {}).map((item) => item.message);
  } else if (err?.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    errors = [err.message];
  } else if (err?.name === 'MulterError') {
    statusCode = 400;
    message = 'File upload error';
    errors = [err.message];
  } else if (err?.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large';
    errors = [err.message];
  }

  // Log full error in all environments
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel](`${req.method} ${req.originalUrl} → ${statusCode}`, {
    error: err.message,
    stack: err.stack,
    statusCode,
  });

  // In production, don't expose internal error details to the client
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
    errors = undefined;
  }

  return errorResponse(res, { statusCode, message, errors });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
