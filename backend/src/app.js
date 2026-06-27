// backend/src/app.js
// SIEPA Backend - Production-ready Express application

const express = require('express');
const helmet = require('helmet');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { RateLimiterMemory } = require('rate-limiter-flexible');

dotenv.config();

const logger = require('./config/logger');
const { validateEnv } = require('./config/envValidator');

// Validate environment before starting
validateEnv();

const app = express();

const nodeMajor = Number(String(process.versions.node || '0').split('.')[0]);
if (nodeMajor !== 20) {
  logger.warn(`SIEPA backend target runtime is Node 20.x. Current: ${process.versions.node}`);
}

// ======================= AUTO-CREATE DIRECTORIES =======================
const requiredDirs = [
  'uploads',
  'uploads/extracted',
  'uploads/questions',
  'uploads/tmp',
  'uploads/course-materials',
  'uploads/imports',
  'uploads/physical-templates',
  'uploads/assets',
];

for (const dir of requiredDirs) {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
}

// ======================= CORS CONFIGURATION =======================
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : [
      'http://localhost:5173',
      'http://localhost:3000',
    ];

logger.info(`CORS origins: ${corsOrigin.join(', ')}`);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman, mobile apps)
    if (!origin) return callback(null, true);

    if (corsOrigin.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // 24 hours preflight cache
}));

// ======================= SECURITY MIDDLEWARES =======================
app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

// ======================= RATE LIMITING =======================
const isProduction = process.env.NODE_ENV === 'production';

// General API rate limiter
const generalLimiter = new RateLimiterMemory({
  points: isProduction ? 200 : 1000,  // More generous in dev
  duration: 60,
});

// Strict rate limiter for auth routes
const authLimiter = new RateLimiterMemory({
  points: 20,   // 20 requests
  duration: 60, // per minute
});

// Strict rate limiter for OCR / AI routes
const heavyLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
});

// Apply rate limiters
app.use((req, res, next) => {
  // Auth routes get strict limiting
  if (req.path.startsWith('/api/auth')) {
    return authLimiter.consume(req.ip)
      .then(() => next())
      .catch(() => {
        logger.warn(`Rate limit hit on auth route from IP: ${req.ip}`);
        return res.status(429).json({
          message: 'Demasiados intentos. Espera un minuto e intenta de nuevo.'
        });
      });
  }

  // OCR and AI routes get heavy limiter
  if (req.path.startsWith('/api/ocr') || req.path.startsWith('/api/ai')) {
    return heavyLimiter.consume(req.ip)
      .then(() => next())
      .catch(() => {
        logger.warn(`Rate limit hit on heavy route from IP: ${req.ip}`);
        return res.status(429).json({
          message: 'Demasiadas peticiones a servicios de IA/OCR. Intenta mas tarde.'
        });
      });
  }

  // Skip rate limiting for root and health check
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  // General rate limiting for all other routes
  return generalLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`General rate limit hit from IP: ${req.ip}`);
      return res.status(429).json({
        message: 'Demasiadas peticiones. Intenta mas tarde.'
      });
    });
});

// ======================= REQUEST LOGGING =======================
if (!isProduction) {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// ======================= ROUTES =======================
const authRoutes              = require('./routes/authRoutes');
const questionRoutes          = require('./routes/questionRoutes');
const bookletRoutes           = require('./routes/bookletRoutes');
const evaluationRoutes        = require('./routes/evaluationRoutes');
const reportRoutes            = require('./routes/reportRoutes');
const studentRoutes           = require('./routes/studentRoutes');
const teacherRoutes           = require('./routes/teacherRoutes');
const simulacroRoutes         = require('./routes/simulacroRoutes');
const courseRoutes            = require('./routes/courseRoutes');
const adminRoutes             = require('./routes/adminRoutes');
const teacherOcrRoutes        = require('./routes/teacherOcrRoutes');
const teacherPdfImportRoutes  = require('./routes/teacherPdfImportRoutes');
const adminPdfImportRoutes    = require('./routes/adminPdfImportRoutes');
const aiRoutes                = require('./routes/aiRoutes');
const ocrRoutes               = require('./routes/ocrRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

app.use('/api/auth',              authRoutes);
app.use('/api/questions',         questionRoutes);
app.use('/api/booklets',          bookletRoutes);
app.use('/api/evaluations',       evaluationRoutes);
app.use('/api/reports',           reportRoutes);
app.use('/api/teacher/ocr',       teacherOcrRoutes);
app.use('/api/teacher/pdf-import', teacherPdfImportRoutes);
app.use('/api/student',           studentRoutes);
app.use('/api/teacher',           teacherRoutes);
app.use('/api/simulacros',        simulacroRoutes);
app.use('/api/courses',           courseRoutes);
app.use('/api/admin',             adminRoutes);
app.use('/api/admin/pdf-import',  adminPdfImportRoutes);
app.use('/api/ai',                aiRoutes);
app.use('/api/ocr',               ocrRoutes);

// ======================= HEALTH CHECK =======================
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SIEPA Backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.versions.node,
  });
});

// ======================= ERROR HANDLERS =======================
app.use(notFoundHandler);
app.use(errorHandler);

// ======================= GRACEFUL SHUTDOWN =======================
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`SIEPA Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

const shutdown = (signal) => {
  logger.info(`[${signal}] Shutting down server gracefully...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  // Force-kill after 10s if connections stay open
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Handle uncaught exceptions / rejections
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${err.port || PORT} already in use. Run: npx kill-port ${err.port || PORT}`);
    process.exit(1);
  }
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  // Don't call process.exit() so the error is visible before nodemon restarts
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});
