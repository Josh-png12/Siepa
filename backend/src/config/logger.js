// Winston structured logger for SIEPA production

const winston = require('winston');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  isProduction
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
        })
      )
);

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  // Don't exit on logger errors
  exitOnError: false,
});

// Stream interface for Morgan / Express middleware compatibility
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = logger;
