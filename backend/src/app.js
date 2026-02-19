// backend/src/app.js
const express = require('express');
const helmet = require('helmet');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { RateLimiterMemory } = require('rate-limiter-flexible');

dotenv.config();
const app = express();

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  setTimeout(() => process.exit(1), 50);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  setTimeout(() => process.exit(1), 50);
});

const nodeMajor = Number(String(process.versions.node || '0').split('.')[0]);
if (nodeMajor !== 20) {
  console.warn(`[WARN] SIEPA backend target runtime is Node 20.x. Current: ${process.versions.node}`);
}

// ======================= MIDDLEWARES =======================
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Permite credenciales (necesario para JWT)
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ======================= RATE LIMITER =======================
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

app.use((req, res, next) => {
  if (
    req.path === '/' ||
    req.path === '/api/auth/register' ||
    req.path === '/api/auth/login'
  ) {
    return next();
  }

  rateLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => res.status(429).json({
      message: 'Demasiadas peticiones. Intenta mas tarde.'
    }));
});

// ======================= CONEXION A MONGODB =======================
connectDB();

// ======================= RUTAS =======================
const authRoutes        = require('./routes/authRoutes');
const questionRoutes    = require('./routes/questionRoutes');
const bookletRoutes     = require('./routes/bookletRoutes');
const evaluationRoutes  = require('./routes/evaluationRoutes');
const reportRoutes      = require('./routes/reportRoutes');
const studentRoutes     = require('./routes/studentRoutes');
const teacherRoutes     = require('./routes/teacherRoutes');
const simulacroRoutes   = require('./routes/simulacroRoutes');
const courseRoutes      = require('./routes/courseRoutes');
const adminRoutes       = require('./routes/adminRoutes');
const teacherOcrRoutes  = require('./routes/teacherOcrRoutes');
const teacherPdfImportRoutes = require('./routes/teacherPdfImportRoutes');
const adminPdfImportRoutes = require('./routes/adminPdfImportRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

app.use('/api/auth',        authRoutes);
app.use('/api/questions',   questionRoutes);
app.use('/api/booklets',    bookletRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/reports',     reportRoutes);
app.use('/api/teacher/ocr', teacherOcrRoutes);
app.use('/api/teacher/pdf-import', teacherPdfImportRoutes);
app.use('/api/student',     studentRoutes);
app.use('/api/teacher',     teacherRoutes);
app.use('/api/simulacros',  simulacroRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/admin/pdf-import', adminPdfImportRoutes);

// ======================= RUTA DE PRUEBA =======================
app.get('/', (req, res) => {
  res.send('SIEPA Backend funcionando');
});

app.use(notFoundHandler);
app.use(errorHandler);

// ======================= INICIO DEL SERVIDOR =======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
