const { RateLimiterMemory } = require('rate-limiter-flexible');

const uploadLimiter = new RateLimiterMemory({
  points: 12,
  duration: 60
});

const confirmLimiter = new RateLimiterMemory({
  points: 20,
  duration: 60
});

const createLimiter = (limiter) => async (req, res, next) => {
  try {
    await limiter.consume(`${req.user?.id || req.ip}:${req.path}`);
    return next();
  } catch (_error) {
    return res.status(429).json({
      success: false,
      data: null,
      message: 'RateLimitExceeded',
      errors: ['Too many requests for this endpoint']
    });
  }
};

module.exports = {
  limitPdfImportUploads: createLimiter(uploadLimiter),
  limitPdfImportConfirm: createLimiter(confirmLimiter)
};
