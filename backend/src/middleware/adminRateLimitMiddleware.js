const { RateLimiterMemory } = require('rate-limiter-flexible');

const heavyLimiter = new RateLimiterMemory({
  points: 25,
  duration: 60
});

const reportLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60
});

const createRateLimitMiddleware = (limiter) => async (req, res, next) => {
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
  heavyAdminRateLimit: createRateLimitMiddleware(heavyLimiter),
  reportRateLimit: createRateLimitMiddleware(reportLimiter)
};
