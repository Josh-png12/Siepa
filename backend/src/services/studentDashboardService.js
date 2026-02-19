// backend/src/services/studentDashboardService.js
const Student = require('../models/Student');
const StudentProgress = require('../models/StudentProgress');
const Simulacro = require('../models/Simulacro');
const Course = require('../models/Course');
const User = require('../models/User');

class StudentDashboardService {
  
  async getDashboardData(userId) {
    try {
      const [
        user,
        studentRecord,
        progress,
        simulacrosInfo
      ] = await Promise.all([
        this._getUserInfo(userId),
        this._getStudentRecord(userId),
        this._getOrCreateProgress(userId),
        this._getSimulacrosInfo(userId)
      ]);

      const courseInfo = await this._getCourseInfo(studentRecord);
      const competencias = this._formatCompetencias(progress);
      const tendencia = this._calculateTendencia(progress);
      const alertas = this._generateAlertas(progress, tendencia);
      const ranking = await this._getRankingPosition(userId, studentRecord, progress);

      return {
        student: {
          id: user._id,
          name: user.name,
          email: user.email,
          grade: studentRecord?.grade || 'No asignado',
          courseName: courseInfo?.name || 'Sin curso'
        },

        metrics: {
          currentTheta: progress?.currentTheta || 0,
          globalScore: progress?.globalScore || 0,
          percentile: progress?.percentile || 50,
          simulacrosCompletados: progress?.simulacrosCompletados || 0,
          racha: progress?.rachaActual || 0,
          totalPreguntas: this._getTotalPreguntas(progress)
        },

        competencias: competencias,

        tendencia: {
          direction: tendencia.direction,
          change: tendencia.change,
          lastFive: progress?.historialTheta?.slice(-5) || []
        },

        alertas: alertas,

        ranking: {
          position: ranking.position,
          total: ranking.total,
          percentageAbove: ranking.percentageAbove
        },

        simulacrosDisponibles: simulacrosInfo.disponibles,
        historialReciente: simulacrosInfo.historial,

        lastUpdate: new Date(),
        nextSimulacro: simulacrosInfo.disponibles[0] || null
      };

    } catch (error) {
      console.error('❌ Error en getDashboardData:', error);
      throw new Error('Error al cargar dashboard del estudiante');
    }
  }

  async _getUserInfo(userId) {
    const user = await User.findById(userId)
      .select('name email role')
      .lean();
    
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    
    return user;
  }

  async _getStudentRecord(userId) {
    const student = await Student.findOne({ user: userId })
      .select('grade courses')
      .lean();

    return student;
  }

  async _getOrCreateProgress(userId) {
    let progress = await StudentProgress.findOne({ student: userId })
      .lean();

    if (!progress) {
      progress = await StudentProgress.create({
        student: userId,
        currentTheta: 0,
        globalScore: 0,
        percentile: 50,
        competencies: [],
        historialTheta: [],
        alertas: [],
        rachaActual: 0,
        simulacrosCompletados: 0
      });
    }

    return progress;
  }

  async _getSimulacrosInfo(userId) {
    const studentRecord = await Student.findOne({ user: userId })
      .select('courses')
      .lean();
    
    if (!studentRecord?.courses?.length) {
      return { disponibles: [], historial: [] };
    }

    const progress = await StudentProgress.findOne({ student: userId })
      .select('historialTheta')
      .lean();

    const completedIds = progress?.historialTheta?.map(h => h.simulacro).filter(Boolean) || [];

    const disponibles = await Simulacro.find({
      course: { $in: studentRecord.courses },
      active: true,
      _id: { $nin: completedIds }
    })
      .populate('course', 'name grade')
      .select('title description duration questions type createdAt')
      .sort({ createdAt: -1 })
      .limit(12)
      .lean();

    const disponiblesFormatted = disponibles.map(sim => ({
      _id: sim._id,
      title: sim.title,
      description: sim.description,
      duration: sim.duration,
      questionsCount: sim.questions?.length || 0,
      courseName: sim.course?.name,
      grade: sim.course?.grade,
      type: sim.type,
      createdAt: sim.createdAt
    }));

    const historial = progress?.historialTheta?.slice(-10) || [];

    return {
      disponibles: disponiblesFormatted,
      historial: historial
    };
  }

  async _getCourseInfo(studentRecord) {
    if (!studentRecord?.courses?.[0]) return null;

    const course = await Course.findById(studentRecord.courses[0])
      .select('name grade')
      .lean();

    return course;
  }

  _formatCompetencias(progress) {
    const areas = ['matematicas', 'lecturaCritica', 'cienciasNaturales', 'sociales', 'ingles'];
    const competenciasMap = {};

    areas.forEach(area => {
      const comp = progress?.competencies?.find(c => 
        c.area === area.toLowerCase().replace('lecturacrítica', 'lectura').replace('cienciasnaturales', 'ciencias')
      );
      
      competenciasMap[area] = {
        theta: comp?.theta || 0,
        nivel: this._getThetaLevel(comp?.theta || 0),
        percentile: this._thetaToPercentile(comp?.theta || 0),
        questionsAnswered: comp?.questionsAnswered || 0
      };
    });

    return competenciasMap;
  }

  _calculateTendencia(progress) {
    const historial = progress?.historialTheta || [];
    
    if (historial.length < 2) {
      return { direction: 'stable', change: 0 };
    }

    const recent = historial.slice(-3);
    const previous = historial.slice(-6, -3);

    if (previous.length === 0) {
      return { direction: 'stable', change: 0 };
    }

    const recentAvg = recent.reduce((sum, h) => sum + (h.theta || 0), 0) / recent.length;
    const previousAvg = previous.reduce((sum, h) => sum + (h.theta || 0), 0) / previous.length;

    const change = previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / Math.abs(previousAvg)) * 100;

    return {
      direction: change > 2 ? 'up' : change < -2 ? 'down' : 'stable',
      change: change.toFixed(1)
    };
  }

  _generateAlertas(progress, tendencia) {
    const alertas = [];

    if (progress?.currentTheta < -1) {
      alertas.push({
        type: 'danger',
        title: 'Nivel de habilidad bajo',
        message: `Tu θ actual (${progress.currentTheta.toFixed(2)}) requiere refuerzo`,
        action: 'Ver material de apoyo'
      });
    }

    if (tendencia.direction === 'down') {
      alertas.push({
        type: 'warning',
        title: 'Tendencia descendente',
        message: `Tu rendimiento ha bajado ${Math.abs(tendencia.change)}%`,
        action: 'Revisar competencias'
      });
    }

    if (tendencia.direction === 'up' && parseFloat(tendencia.change) > 5) {
      alertas.push({
        type: 'success',
        title: '¡Excelente progreso!',
        message: `Has mejorado ${tendencia.change}%`,
        action: 'Continuar practicando'
      });
    }

    if (progress?.rachaActual >= 5) {
      alertas.push({
        type: 'info',
        title: `Racha de ${progress.rachaActual} días`,
        message: '¡Mantén tu constancia!',
        action: 'Ver estadísticas'
      });
    }

    return alertas;
  }

  async _getRankingPosition(userId, studentRecord, progress) {
    if (!studentRecord?.courses?.[0]) {
      return { position: 0, total: 0, percentageAbove: 0 };
    }

    const courseId = studentRecord.courses[0];
    
    const courseStudents = await Student.find({ courses: courseId })
      .select('user')
      .lean();

    const studentUserIds = courseStudents.map(s => s.user);

    const allProgress = await StudentProgress.find({
      student: { $in: studentUserIds }
    })
      .select('student currentTheta')
      .sort({ currentTheta: -1 })
      .lean();

    const position = allProgress.findIndex(p => 
      p.student.toString() === userId.toString()
    ) + 1;

    const total = allProgress.length;
    const percentageAbove = total > 0 
      ? ((total - position) / total * 100).toFixed(1)
      : 0;

    return { position, total, percentageAbove };
  }

  _getTotalPreguntas(progress) {
    return progress?.historialTheta?.reduce((sum, h) => sum + (h.totalPreguntas || 0), 0) || 0;
  }

  _getThetaLevel(theta) {
    if (theta >= 2) return 'Avanzado';
    if (theta >= 1) return 'Intermedio-Alto';
    if (theta >= 0) return 'Intermedio';
    if (theta >= -1) return 'Básico';
    return 'Inicial';
  }

  _thetaToPercentile(theta) {
    const percentile = 50 + (theta * 34);
    return Math.max(0, Math.min(100, Math.round(percentile)));
  }
}

module.exports = new StudentDashboardService();