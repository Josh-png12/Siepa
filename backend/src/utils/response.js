const successResponse = (res, { data = null, message = undefined, statusCode = 200 } = {}) => {
  const payload = {
    success: true,
    data
  };

  if (message) payload.message = message;

  return res.status(statusCode).json(payload);
};

const errorResponse = (res, { statusCode = 500, message = 'InternalError', errors = undefined } = {}) => {
  const payload = {
    success: false,
    data: null,
    message
  };

  if (errors) payload.errors = errors;

  return res.status(statusCode).json(payload);
};

module.exports = {
  successResponse,
  errorResponse
};
