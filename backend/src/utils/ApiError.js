class ApiError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

module.exports = ApiError;
