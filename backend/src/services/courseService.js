// backend/src/services/courseService.js
const Course = require('../models/Course');
const StudentProgress = require('../models/StudentProgress'); // Si necesitas para analítica extendida
const mongoose = require('mongoose'); // Para ObjectId validation

// Helper para validar ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

async function getDashboardData(teacherId) {
  if (!isValidObjectId(teacherId)) throw new Error('ID de docente inválido');
  try {
    // Aggregations eficientes para dashboard: cursos + stats TRI grupales
    const courses = await Course.aggregate([
      { $match: { teacher: new mongoose.Types.ObjectId(teacherId), status: 'active' } },
      {
        $lookup: {
          from: 'studentprogresses', // Colección de StudentProgress
          localField: 'students',
          foreignField: 'student', // Asume StudentProgress tiene 'student' ref a User
          as: 'progressData'
        }
      },
      {
        $project: {
          name: 1,
          grade: 1,
          year: 1,
          studentCount: { $size: '$students' },
          avgTheta: { $avg: '$progressData.currentTheta' }, // Calcula en query para frescura
          riskStudents: { $size: { $filter: { input: '$progressData', cond: { $gt: [{ $size: '$$this.alertas' }, 0] } } } }
        }
      }
    ]);
    return courses;
  } catch (error) {
    throw new Error(`Error en dashboard data: ${error.message}`);
  }
}

async function getCoursesByTeacher(teacherId) {
  if (!isValidObjectId(teacherId)) throw new Error('ID de docente inválido');
  try {
    return await Course.find({ teacher: teacherId, status: 'active' })
      .select('name grade year students averageTheta')
      .populate('students', 'name email') // Populate mínimo para performance
      .lean(); // Lean para objetos JS rápidos
  } catch (error) {
    throw new Error(`Error obteniendo cursos: ${error.message}`);
  }
}

async function getAnalytics(courseId, teacherId) {
  if (!isValidObjectId(courseId) || !isValidObjectId(teacherId)) throw new Error('IDs inválidos');
  try {
    const course = await Course.findOne({ _id: courseId, teacher: teacherId })
      .populate('students', 'name');
    if (!course) throw new Error('Curso no encontrado o no autorizado');
    
    // Analítica TRI: fetch progress y computa
    const progresses = await StudentProgress.find({ student: { $in: course.students } })
      .select('currentTheta percentile competencies alertas historialTheta');
    
    const analytics = {
      avgTheta: course.averageTheta, // Usa el pre-save cached
      avgPercentile: progresses.reduce((sum, p) => sum + p.percentile, 0) / progresses.length || 0,
      risks: progresses.filter(p => p.alertas.length > 0).length,
      competenciesBreakdown: aggregateCompetencies(progresses), // Función helper abajo
      historialTrends: computeTrends(progresses) // Ejemplo: tendencias θ over time
    };
    return { course, analytics };
  } catch (error) {
    throw new Error(`Error en analítica: ${error.message}`);
  }
}

// Helper ejemplo para competencies (adapta a tu modelo)
function aggregateCompetencies(progresses) {
  const compMap = {};
  progresses.forEach(p => {
    p.competencies.forEach(c => {
      compMap[c.name] = (compMap[c.name] || 0) + c.score;
    });
  });
  return Object.fromEntries(Object.entries(compMap).map(([k, v]) => [k, v / progresses.length]));
}

// Helper ejemplo para trends
function computeTrends(progresses) {
  // Lógica simple: avg θ por fecha en historialTheta[]
  return 'Tendencias calculadas'; // Expande con lógica real TRI
}

async function isTeacherOwner(courseId, teacherId) {
  if (!isValidObjectId(courseId) || !isValidObjectId(teacherId)) return false;
  try {
    const course = await Course.findById(courseId);
    return course && course.teacher.equals(teacherId); // Usa equals para ObjectId
  } catch (error) {
    return false;
  }
}

module.exports = {
  getDashboardData,
  getCoursesByTeacher,
  getAnalytics,
  isTeacherOwner
  // Agrega más: e.g., createCourse para admins, assignStudents, etc.
};