const multer = require('multer');
const path = require('path');
const prisma = require('../config/prisma');

// ============================
// MULTER CONFIG
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
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
// HELPERS
// ============================
const getCourseEnrollments = (courses) =>
  [...new Set(courses.flatMap((c) => c.enrollments.map((e) => e.student.userId)))];

// ============================
// DASHBOARD DOCENTE
// ============================
const getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    const courses = await prisma.course.findMany({
      where: { teacherId, schoolId },
      include: {
        enrollments: {
          include: { student: { select: { userId: true } } }
        }
      }
    });

    const totalCourses = courses.length;
    const studentUserIds = getCourseEnrollments(courses);
    const totalStudents = studentUserIds.length;

    if (!totalStudents) {
      return res.json({
        success: true,
        data: {
          totalCourses,
          totalStudents: 0,
          averageTheta: 0,
          simulacrosAplicados: 0,
          ranking: [],
          atRiskStudents: [],
          thetaTrend: [],
          distribution: []
        }
      });
    }

    const progresses = await prisma.studentProgress.findMany({
      where: { studentId: { in: studentUserIds } },
      include: {
        student: { select: { id: true, name: true } },
        thetaHistory: { orderBy: { recordedAt: 'asc' }, take: 10 }
      }
    });

    const averageTheta = progresses.length
      ? Number(
          (progresses.reduce((sum, p) => sum + Number(p.currentTheta || 0), 0) / progresses.length).toFixed(2)
        )
      : 0;

    const simulacrosAplicados = progresses.reduce((sum, p) => sum + (p.simulacrosCompletados || 0), 0);

    const ranking = [...progresses]
      .sort((a, b) => Number(b.currentTheta || 0) - Number(a.currentTheta || 0))
      .slice(0, 5)
      .map((p) => ({ id: p.studentId, name: p.student?.name || '', theta: Number(p.currentTheta || 0) }));

    const atRiskStudents = [...progresses]
      .filter((p) => Number(p.currentTheta || 0) < 0.4)
      .sort((a, b) => Number(a.currentTheta || 0) - Number(b.currentTheta || 0))
      .slice(0, 5)
      .map((p) => ({ id: p.studentId, name: p.student?.name || '', theta: Number(p.currentTheta || 0) }));

    // Aggregate theta history by month → array of avg theta values
    const monthMap = new Map();
    progresses.forEach((p) => {
      (p.thetaHistory || []).forEach((entry) => {
        const d = new Date(entry.recordedAt);
        if (Number.isNaN(d.getTime())) return;
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key).push(Number(entry.theta || 0));
      });
    });

    let thetaTrend = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([, values]) =>
        Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2))
      );

    if (!thetaTrend.length) thetaTrend = [averageTheta];

    return res.json({
      success: true,
      data: {
        totalCourses,
        totalStudents,
        averageTheta,
        simulacrosAplicados,
        ranking,
        atRiskStudents,
        thetaTrend,
        distribution: []
      }
    });
  } catch (error) {
    console.error('[teacherController.getDashboard]', error);
    return res.status(500).json({ success: false, message: 'Error en dashboard docente' });
  }
};

// ============================
// CURSOS
// ============================
const getCourses = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    const courses = await prisma.course.findMany({
      where: { teacherId, schoolId },
      include: {
        enrollments: {
          include: { student: { select: { userId: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const result = courses.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      year: c.year,
      status: c.status,
      averageTheta: Number(c.averageTheta || 0),
      studentCount: c.enrollments.length,
      students: c.enrollments.map((e) => ({ id: e.student.userId }))
    }));

    return res.json({ success: true, courses: result });
  } catch (error) {
    console.error('[teacherController.getCourses]', error);
    return res.status(500).json({ success: false, message: 'Error al cargar cursos' });
  }
};

// ============================
// ESTUDIANTES DE UN CURSO
// ============================
const getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId, schoolId },
      include: {
        enrollments: {
          include: { student: { select: { userId: true } } }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado o no autorizado' });
    }

    const studentUserIds = course.enrollments.map((e) => e.student.userId);

    const [students, progresses] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: studentUserIds } },
        select: { id: true, name: true, email: true }
      }),
      prisma.studentProgress.findMany({
        where: { studentId: { in: studentUserIds } }
      })
    ]);

    const progressMap = new Map(progresses.map((p) => [p.studentId, p]));

    const studentsWithProgress = students.map((student) => {
      const progress = progressMap.get(student.id) || {};
      return {
        id: student.id,
        name: student.name,
        email: student.email,
        currentTheta: Number(progress.currentTheta || 0),
        percentile: Number(progress.percentile || 0),
        rachaActual: Number(progress.rachaActual || 0),
        simulacrosCompletados: Number(progress.simulacrosCompletados || 0)
      };
    });

    return res.json({ success: true, students: studentsWithProgress });
  } catch (error) {
    console.error('[teacherController.getCourseStudents]', error);
    return res.status(500).json({ success: false, message: 'Error al cargar estudiantes' });
  }
};

// ============================
// ANALÍTICA DE UN CURSO
// ============================
const getCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId, schoolId },
      include: {
        enrollments: {
          include: { student: { select: { userId: true } } }
        }
      }
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Curso no encontrado o no autorizado' });
    }

    const studentUserIds = course.enrollments.map((e) => e.student.userId);

    const progresses = await prisma.studentProgress.findMany({
      where: { studentId: { in: studentUserIds } }
    });

    const avgTheta = progresses.length
      ? Number(
          (progresses.reduce((s, p) => s + Number(p.currentTheta || 0), 0) / progresses.length).toFixed(2)
        )
      : 0;

    return res.json({
      success: true,
      analytics: {
        courseName: course.name,
        totalStudents: studentUserIds.length,
        averageTheta: avgTheta,
        riskStudents: progresses.filter((p) => Number(p.currentTheta || 0) < 0.4).length
      }
    });
  } catch (error) {
    console.error('[teacherController.getCourseAnalytics]', error);
    return res.status(500).json({ success: false, message: 'Error en analítica del curso' });
  }
};

// ============================
// SIMULACROS / OCR / REPORTES (placeholders)
// ============================
const createSimulacro = async (req, res) => {
  res.status(501).json({ success: false, message: 'Crear simulacro aún no implementado' });
};

const uploadPhysicalSheet = (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No se subió archivo' });
    res.json({ success: true, message: 'Archivo recibido', file: req.file });
  });
};

const processOCR = async (req, res) => {
  res.status(501).json({ success: false, message: 'Procesamiento OCR aún no implementado' });
};

const confirmSheet = async (req, res) => {
  res.status(501).json({ success: false, message: 'Confirmación manual aún no implementada' });
};

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
