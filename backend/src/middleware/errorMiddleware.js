const ApiError = require('../utils/ApiError');
const { errorResponse } = require('../utils/response');

const notFoundHandler = (req, _res, next) => {
  next(new ApiError(404, `NotFound: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return;

  let statusCode = 500;
  let message = 'InternalError';
  let errors;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors || undefined;
  } else if (err?.name === 'ValidationError') {
    statusCode = 400;
    message = 'ValidationError';
    errors = Object.values(err.errors || {}).map((item) => item.message);
  } else if (err?.name === 'CastError') {
    statusCode = 400;
    message = 'ValidationError';
    errors = [err.message];
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', req.method, req.originalUrl, err);
  }

  return errorResponse(res, { statusCode, message, errors });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
