const prisma = require('../config/prisma');

const calculateAnalytics = async (studentId) => {
  const progress = await prisma.studentProgress.findUnique({
    where: { studentId },
    include: {
      competencies: { orderBy: { theta: 'desc' } },
      thetaHistory: { orderBy: { recordedAt: 'asc' }, take: 50 },
      alerts: { where: { leida: false } }
    }
  });

  if (!progress) return null;

  const recentThetas = progress.thetaHistory.slice(-5).map((h) => h.theta);
  const tendencia =
    recentThetas.length >= 2 ? recentThetas[recentThetas.length - 1] - recentThetas[0] : 0;

  return {
    thetaGlobal: progress.currentTheta,
    globalScore: progress.globalScore,
    percentile: progress.percentile,
    competenciaFuerte: progress.competencies[0] || null,
    competenciaDebil: progress.competencies[progress.competencies.length - 1] || null,
    tendencia: tendencia > 0 ? 'subiendo' : tendencia < 0 ? 'bajando' : 'estable',
    simulacrosCompletados: progress.simulacrosCompletados,
    rachaActual: progress.rachaActual,
    alertas: progress.alerts
  };
};

module.exports = { calculateAnalytics };
