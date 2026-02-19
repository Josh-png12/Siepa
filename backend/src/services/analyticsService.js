// backend/src/services/analyticsService.js
const StudentProgress = require('../models/StudentProgress');

const calculateAnalytics = async (studentId) => {
  const progress = await StudentProgress.findOne({ student: studentId });
  if (!progress) return null;

  const competenciasOrdenadas = [...progress.competencies].sort((a, b) => b.theta - a.theta);

  // Tendencia reciente
  const recentThetas = progress.historialTheta.slice(-5).map(h => h.theta);
  const tendencia = recentThetas.length >= 2 
    ? recentThetas[recentThetas.length - 1] - recentThetas[0]
    : 0;

  return {
    thetaGlobal: progress.currentTheta,
    globalScore: progress.globalScore,
    percentile: progress.percentile,
    competenciaFuerte: competenciasOrdenadas[0],
    competenciaDebil: competenciasOrdenadas[competenciasOrdenadas.length - 1],
    tendencia: tendencia > 0 ? 'subiendo' : tendencia < 0 ? 'bajando' : 'estable',
    simulacrosCompletados: progress.simulacrosCompletados,
    rachaActual: progress.rachaActual,
    alertas: progress.alertas
  };
};

module.exports = { calculateAnalytics };