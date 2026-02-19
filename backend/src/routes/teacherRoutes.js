// backend/src/routes/teacherRoutes.js

const express = require('express');
const router = express.Router();

// Middleware de autenticación
const { protect, roleCheck } = require('../middleware/authMiddleware');

// Controller
const teacherController = require('../controllers/teacherController');
const teacherInsightsController = require('../controllers/teacherInsightsController');


// ============================
// PROTECCIÓN GLOBAL DOCENTE
// ============================

// Primero valida JWT
router.use(protect);

// Luego valida que sea rol docente
router.use(roleCheck(['docente']));


// ============================
// DASHBOARD
// ============================

router.get('/dashboard', teacherController.getDashboard);
router.get('/insights/dashboard', teacherInsightsController.getDashboardInsights);


// ============================
// CURSOS
// ============================

router.get('/courses', teacherController.getCourses);

router.get(
  '/courses/:courseId/students',
  teacherController.getCourseStudents
);

router.get(
  '/courses/:courseId/analytics',
  teacherController.getCourseAnalytics
);

router.get(
  '/course/:courseId/insights',
  teacherInsightsController.getCourseInsights
);


// ============================
// SIMULACROS
// ============================

router.post(
  '/simulacros',
  teacherController.createSimulacro
);


// ============================
// OCR / HOJAS FÍSICAS
// ============================

router.post(
  '/upload-sheet',
  teacherController.uploadPhysicalSheet
);

router.post(
  '/process-ocr',
  teacherController.processOCR
);

router.post(
  '/confirm-sheet',
  teacherController.confirmSheet
);


// ============================
// REPORTES
// ============================

router.get(
  '/report/student/:studentId',
  teacherController.getStudentReport
);

router.get(
  '/report/course/:courseId',
  teacherController.getCourseReport
);

router.get(
  '/course/:courseId/report',
  teacherInsightsController.getCourseReportPdf
);


// ============================
// EXPORTAR ROUTER
// ============================

module.exports = router;
