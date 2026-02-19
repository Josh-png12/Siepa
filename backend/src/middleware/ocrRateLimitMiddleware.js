const { RateLimiterMemory } = require('rate-limiter-flexible');
const ApiError = require('../utils/ApiError');

const uploadRateLimiter = new RateLimiterMemory({
  points: 12,
  duration: 60
});

const limitOcrUploads = async (req, _res, next) => {
  try {
    const userKey = `${req.user?.id || 'anonymous'}:${req.params?.id || 'global'}`;
    await uploadRateLimiter.consume(userKey);
    return next();
  } catch (_error) {
    return next(new ApiError(429, 'Too many OCR upload requests. Please retry later.'));
  }
};

module.exports = {
  limitOcrUploads
};
