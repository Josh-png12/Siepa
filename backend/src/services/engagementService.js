const streakService = require('./streakService');
const badgeService = require('./badgeService');
const areaProgressService = require('./areaProgressService');

const { normalizeArea } = areaProgressService;

const processStudentActivity = async (studentId, schoolId, { resultadoPorArea = {}, esElPrimero = false } = {}) => {
  const streak = await streakService.recordActivity(studentId, schoolId);
  const { previousScores } = await areaProgressService.updateAreaProgress(studentId, schoolId, resultadoPorArea);
  const newBadges = await badgeService.checkAndAwardBadges(studentId, schoolId, {
    resultadoPorArea,
    streakActual: streak.currentStreak,
    esElPrimero,
    previousScores
  });
  return { streak, newBadges };
};

module.exports = { processStudentActivity, normalizeArea };
