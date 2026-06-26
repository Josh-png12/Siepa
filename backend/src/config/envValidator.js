// backend/src/config/envValidator.js
// Validates required environment variables on startup

const logger = require('./logger');

/**
 * Required env vars for production. The app will refuse to start if any are missing.
 * In development, missing vars only produce warnings.
 */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
];

const RECOMMENDED_VARS = [
  'REPLICATE_API_TOKEN',
  'CORS_ORIGIN',
];

/**
 * Validate environment variables. Returns true if all required vars are set.
 * Logs warnings for recommended vars.
 * @param {boolean} [strict=false] - If true, exits the process on missing required vars
 * @returns {boolean}
 */
function validateEnv(strict = false) {
  const missing = [];
  const missingRecommended = [];

  for (const varName of REQUIRED_VARS) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missing.push(varName);
    }
  }

  for (const varName of RECOMMENDED_VARS) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missingRecommended.push(varName);
    }
  }

  // Log configuration summary
  const configSummary = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || 5000,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '(default: http://localhost:5173)',
    DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'MISSING',
    JWT_SECRET: process.env.JWT_SECRET ? '***configured***' : 'MISSING',
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? '***configured***' : 'NOT SET',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '***configured***' : 'NOT SET',
    OCR_SERVICE_URL: process.env.OCR_SERVICE_URL || '(not set)',
  };

  logger.info('Environment configuration', configSummary);

  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(', ')}`;
    logger.error(msg);

    if (strict || process.env.NODE_ENV === 'production') {
      logger.error('Cannot start in production mode without required environment variables. Exiting.');
      process.exit(1);
    }

    logger.warn('Continuing in development mode despite missing variables.');
    return false;
  }

  if (missingRecommended.length > 0) {
    logger.warn(`Recommended environment variables not set: ${missingRecommended.join(', ')}`);
    logger.warn('Some features may not work correctly.');
  }

  logger.info('Environment validation passed');
  return true;
}

module.exports = { validateEnv, REQUIRED_VARS, RECOMMENDED_VARS };
