const prisma = require('../config/prisma');

const erfApprox = (x) => {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
};

const thetaToPercentile = (theta) => {
  const cdf = 0.5 * (1 + erfApprox(Number(theta) / Math.sqrt(2)));
  return Math.max(0, Math.min(100, Math.round(cdf * 100)));
};

const getThetaLevel = (theta) => {
  if (theta >= 2) return 'Avanzado';
  if (theta >= 1) return 'Intermedio-Alto';
  if (theta >= 0) return 'Intermedio';
  if (theta >= -1) return 'Basico';
  return 'Inicial';
};

const calculateTendencia = (thetaHistory) => {
  if (!thetaHistory || thetaHistory.length < 2) return { direction: 'stable', change: 0 };

  const recent = thetaHistory.slice(-3);
  const previous = thetaHistory.slice(-6, -3);
  if (!previous.length) return { direction: 'stable', change: 0 };

  const recentAvg = recent.reduce((sum, h) => sum + Number(h.theta || 0), 0) / recent.length;
  const previousAvg = previous.reduce((sum, h) => sum + Number(h.theta || 0), 0) / previous.length;

  const change = previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / Math.abs(previousAvg)) * 100;
  return {
    direction: change > 2 ? 'up' : change < -2 ? 'down' : 'stable',
    change: Number(change.toFixed(1))
  };
};

const formatCompetencias = (competencies) => {
  const areas = ['matematicas', 'lecturaCritica', 'cienciasNaturales', 'sociales', 'ingles'];
  const competenciasMap = {};

  areas.forEach((area) => {
    const comp = (competencies || []).find((c) =>
      String(c.area || '').toLowerCase().replace(/[\s_]/g, '') ===
      area.toLowerCase().replace(/lecturacritica/i, 'lecturacritica')
    );
    competenciasMap[area] = {
      theta: comp?.theta || 0,
      nivel: getThetaLevel(comp?.theta || 0),
      percentile: thetaToPercentile(comp?.theta || 0),
      questionsAnswered: comp?.questionsAnswered || 0
    };
  });

  return competenciasMap;
};

const generateAlertas = (progress, tendencia) => {
  const alertas = [];

  if (progress && progress.currentTheta < -1) {
    alertas.push({
      type: 'danger',
      title: 'Nivel de habilidad bajo',
      message: `Tu θ actual (${Number(progress.currentTheta).toFixed(2)}) requiere refuerzo`,
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

  if (tendencia.direction === 'up' && Number(tendencia.change) > 5) {
    alertas.push({
      type: 'success',
      title: '¡Excelente progreso!',
      message: `Has mejorado ${tendencia.change}%`,
      action: 'Continuar practicando'
    });
  }

  if (progress && (progress.rachaActual || 0) >= 5) {
    alertas.push({
      type: 'info',
      title: `Racha de ${progress.rachaActual} dias`,
      message: '¡Mantén tu constancia!',
      action: 'Ver estadisticas'
    });
  }

  return alertas;
};

// schoolId-scoped ranking prevents comparing students across schools (multi-tenant fix)
const getRankingPosition = async ({ userId, schoolId, studentRecord }) => {
  if (!studentRecord) return { position: 0, total: 0, percentageAbove: 0 };

  // Get first course enrollment's course to scope the ranking
  const firstEnrollment = await prisma.courseEnrollment.findFirst({
    where: { studentId: studentRecord.id },
    include: { course: { select: { id: true, schoolId: true } } }
  });

  if (!firstEnrollment) return { position: 0, total: 0, percentageAbove: 0 };

  const courseId = firstEnrollment.courseId;

  // Get all students enrolled in the same course (all must share the same schoolId)
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: { student: { select: { userId: true } } }
  });

  const courseStudentUserIds = enrollments.map((e) => e.student.userId);

  const allProgress = await prisma.studentProgress.findMany({
    where: {
      studentId: { in: courseStudentUserIds },
      schoolId // multi-tenant scope: only students in the same school
    },
    select: { studentId: true, currentTheta: true },
    orderBy: { currentTheta: 'desc' }
  });

  const position = allProgress.findIndex((p) => p.studentId === userId) + 1;
  const total = allProgress.length;
  const percentageAbove = total > 0 ? Number(((total - position) / total * 100).toFixed(1)) : 0;

  return { position, total, percentageAbove };
};

const getSimulacrosInfo = async ({ studentRecord, userId, schoolId }) => {
  if (!studentRecord) return { disponibles: [], historial: [] };

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { studentId: studentRecord.id },
    select: { courseId: true }
  });

  if (!enrollments.length) return { disponibles: [], historial: [] };

  const thetaHistory = await prisma.thetaHistory.findMany({
    where: { progress: { studentId: userId } },
    select: { id: true, theta: true, globalScore: true, recordedAt: true },
    orderBy: { recordedAt: 'asc' }
  });

  const disponibles = await prisma.simulacro.findMany({
    where: { schoolId, estado: 'publicado' },
    select: {
      id: true, title: true, description: true, globalTimeLimit: true,
      createdAt: true, estado: true,
      modules: { select: { _count: { select: { questions: true } } } }
    },
    orderBy: { createdAt: 'desc' },
    take: 12
  });

  const disponiblesFormatted = disponibles.map((sim) => ({
    id: sim.id,
    title: sim.title,
    description: sim.description,
    duration: sim.globalTimeLimit,
    questionsCount: (sim.modules || []).reduce((acc, m) => acc + (m._count?.questions || 0), 0),
    createdAt: sim.createdAt
  }));

  return { disponibles: disponiblesFormatted, historial: thetaHistory.slice(-10) };
};

const getOrCreateProgress = async (userId, schoolId) => {
  let progress = await prisma.studentProgress.findUnique({
    where: { studentId: userId },
    include: {
      competencies: true,
      thetaHistory: { orderBy: { recordedAt: 'asc' } }
    }
  });

  if (!progress) {
    progress = await prisma.studentProgress.create({
      data: { studentId: userId, schoolId, currentTheta: 0, globalScore: 0, percentile: 50 },
      include: { competencies: true, thetaHistory: true }
    });
  }

  return progress;
};

const getDashboardData = async (userId, schoolId) => {
  const [userRecord, studentRecord] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } }),
    prisma.student.findUnique({ where: { userId } })
  ]);

  if (!userRecord) throw new Error('Usuario no encontrado');

  const progress = await getOrCreateProgress(userId, schoolId);

  const [courseInfo, simulacrosInfo, ranking] = await Promise.all([
    studentRecord
      ? prisma.courseEnrollment.findFirst({
          where: { studentId: studentRecord.id },
          include: { course: { select: { id: true, name: true, grade: true } } }
        }).then((e) => e?.course || null)
      : Promise.resolve(null),
    getSimulacrosInfo({ studentRecord, userId, schoolId }),
    getRankingPosition({ userId, schoolId, studentRecord })
  ]);

  const thetaHistory = progress.thetaHistory || [];
  const competencias = formatCompetencias(progress.competencies);
  const tendencia = calculateTendencia(thetaHistory);
  const alertas = generateAlertas(progress, tendencia);

  return {
    student: {
      id: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      grade: studentRecord?.grade || 'No asignado',
      courseName: courseInfo?.name || 'Sin curso'
    },
    metrics: {
      currentTheta: progress.currentTheta || 0,
      globalScore: progress.globalScore || 0,
      percentile: progress.percentile || 50,
      simulacrosCompletados: progress.simulacrosCompletados || 0,
      racha: progress.rachaActual || 0,
      totalPreguntas: 0
    },
    competencias,
    tendencia: {
      direction: tendencia.direction,
      change: tendencia.change,
      lastFive: thetaHistory.slice(-5).map((h) => ({ theta: h.theta, date: h.recordedAt }))
    },
    alertas,
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
};

module.exports = { getDashboardData };
