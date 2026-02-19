// backend/src/controllers/teacherController.js
const multer = require('multer');
const path = require('path');
const Course = require('../models/Course');
const StudentProgress = require('../models/StudentProgress');
const Evaluation = require('../models/Evaluation');
// Si tienes estos modelos creados, descomenta. Si no, los handlers devolverán "not implemented" sin romper el require
// const Simulacro = require('../models/Simulacro');
// const PhysicalSheet = require('../models/PhysicalSheet');

// ============================
// MULTER CONFIG (uploads seguros)
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    if (allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Solo imágenes JPG/PNG o PDF'));
    }
  }
});

// ============================
// DASHBOARD DOCENTE (tu código original, solo pequeño refactor)
// ============================
const getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const courses = await Course.find({ teacher: teacherId })
      .populate('students', '_id name')
      .lean();

    const totalCourses = courses.length;
    const studentIds = [...new Set(courses.flatMap(c => c.students.map(s => s._id.toString())))];
    const totalStudents = studentIds.length;

    if (studentIds.length === 0) {
      return res.json({ success: true, data: { totalCourses, totalStudents, averageTheta: 0, simulacrosAplicados: 0, ranking: [], atRiskStudents: [], thetaTrend: [], distribution: [] }});
    }

    const progresses = await StudentProgress.find({ student: { $in: studentIds } })
      .populate('student', 'name')
      .lean();

    const averageTheta = progresses.length ? progresses.reduce((sum, p) => sum + (p.currentTheta || 0), 0) / progresses.length : 0;
    const simulacrosAplicados = progresses.reduce((sum, p) => sum + (p.simulacrosCompletados || 0), 0);

    const ranking = progresses
      .sort((a, b) => b.currentTheta - a.currentTheta)
      .slice(0, 5)
      .map(p => ({ id: p.student._id, name: p.student.name, theta: p.currentTheta }));

    const atRiskStudents = progresses
      .filter(p => p.currentTheta < 0.4)
      .sort((a, b) => a.currentTheta - b.currentTheta)
      .slice(0, 5)
      .map(p => ({ id: p.student._id, name: p.student.name, theta: p.currentTheta }));

    // tendencia últimos 4 puntos
    const thetaTrend = [];
    for (let i = 0; i < 4; i++) {
      const values = progresses
        .map(p => p.historialTheta?.[p.historialTheta.length - 1 - i]?.theta)
        .filter(v => typeof v === 'number');
      if (values.length > 0) thetaTrend.unshift(Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)));
    }

    // distribución campana
    const thetas = progresses.map(p => p.currentTheta || 0);
    const mean = thetas.reduce((a, b) => a + b, 0) / thetas.length;
    const variance = thetas.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / thetas.length;
    const stdDev = Math.sqrt(variance);
    const distribution = [];
    const step = 0.1;
    for (let x = Math.min(...thetas) - 1; x <= Math.max(...thetas) + 1; x += step) {
      const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2)));
      distribution.push({ theta: Number(x.toFixed(2)), density: Number(y.toFixed(5)) });
    }

    res.json({
      success: true,
      data: { totalCourses, totalStudents, averageTheta: Number(averageTheta.toFixed(2)), simulacrosAplicados, ranking, atRiskStudents, thetaTrend, distribution }
    });
  } catch (error) {
    console.error('Error getDashboard:', error);
    res.status(500).json({ success: false, message: 'Error en dashboard docente' });
  }
};

// ============================
// CURSOS
// ============================
const getCourses = async (req, res) => {
  try {
    const courses = await Course.find({ teacher: req.user.id })
      .populate('students', 'name email')
      .lean();
    res.json({ success: true, courses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al cargar cursos' });
  }
};

// ============================
// ESTUDIANTES DE UN CURSO (la función que hacía crash)
// ============================
const getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.id;

    const course = await Course.findOne({ _id: courseId, teacher: teacherId })
      .populate('students', 'name email')
      .lean();

    if (!course) return res.status(404).json({ success: false, message: 'Curso no encontrado o no autorizado' });

    // Traemos los datos TRI de StudentProgress
    const progresses = await StudentProgress.find({
      student: { $in: course.students.map(s => s._id) }
    }).lean();

    const studentsWithProgress = course.students.map(student => {
      const progress = progresses.find(p => p.student.toString() === student._id.toString()) || {};
      return {
        ...student,
        currentTheta: progress.currentTheta || 0,
        percentile: progress.percentile || 0,
        alertas: progress.alertas || [],
        rachaActual: progress.rachaActual || 0,
        simulacrosCompletados: progress.simulacrosCompletados || 0
      };
    });

    res.json({ success: true, students: studentsWithProgress });
  } catch (error) {
    console.error('Error getCourseStudents:', error);
    res.status(500).json({ success: false, message: 'Error al cargar estudiantes' });
  }
};

// ============================
// ANALÍTICA DE UN CURSO
// ============================
const getCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.id;

    const course = await Course.findOne({ _id: courseId, teacher: teacherId });
    if (!course) return res.status(404).json({ success: false, message: 'Curso no encontrado o no autorizado' });

    const progresses = await StudentProgress.find({
      student: { $in: course.students }
    }).lean();

    const avgTheta = progresses.length ? progresses.reduce((s, p) => s + (p.currentTheta || 0), 0) / progresses.length : 0;
    const risks = progresses.filter(p => (p.alertas || []).length > 0).length;

    res.json({
      success: true,
      analytics: {
        courseName: course.name,
        totalStudents: course.students.length,
        averageTheta: Number(avgTheta.toFixed(2)),
        riskStudents: risks,
        // puedes agregar más métricas aquí
      }
    });
  } catch (error) {
    console.error('Error getCourseAnalytics:', error);
    res.status(500).json({ success: false, message: 'Error en analítica del curso' });
  }
};

// ============================
// SIMULACROS (placeholder hasta que tengas el modelo)
// ============================
const createSimulacro = async (req, res) => {
  res.status(501).json({ success: false, message: 'Crear simulacro aún no implementado' });
};

// ============================
// OCR / HOJAS FÍSICAS (placeholder seguro – no rompe si modelos no existen)
// ============================
const uploadPhysicalSheet = (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se subió archivo' });
    res.json({ success: true, message: 'Archivo recibido (OCR pendiente)', file: req.file });
  });
};

const processOCR = async (req, res) => {
  res.status(501).json({ success: false, message: 'Procesamiento OCR aún no implementado' });
};

const confirmSheet = async (req, res) => {
  res.status(501).json({ success: false, message: 'Confirmación manual aún no implementada' });
};

// ============================
// REPORTES (placeholder)
// ============================
const getStudentReport = async (req, res) => {
  res.status(501).json({ success: false, message: 'Reporte de estudiante aún no implementado' });
};

const getCourseReport = async (req, res) => {
  res.status(501).json({ success: false, message: 'Reporte de curso aún no implementado' });
};

// ============================
// EXPORT
// ============================
module.exports = {
  getDashboard,
  getCourses,
  getCourseStudents,
  getCourseAnalytics,
  createSimulacro,
  uploadPhysicalSheet,
  processOCR,
  confirmSheet,
  getStudentReport,
  getCourseReport
};