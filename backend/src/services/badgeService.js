const prisma = require('../config/prisma');
const { BADGES } = require('../config/badges');

const awardBadge = async (studentId, schoolId, badgeKey) => {
  try {
    const badge = await prisma.studentBadge.create({
      data: { studentId, schoolId, badgeKey }
    });
    const def = BADGES[badgeKey] || { key: badgeKey, name: badgeKey, description: '', icon: 'medal' };
    return { ...def, id: badge.id, earnedAt: badge.earnedAt };
  } catch (err) {
    if (err.code === 'P2002') return null; // already earned — idempotent
    throw err;
  }
};

const checkAndAwardBadges = async (studentId, schoolId, { resultadoPorArea = {}, streakActual = 0, esElPrimero = false, previousScores = {} } = {}) => {
  const newBadges = [];

  if (esElPrimero) {
    const b = await awardBadge(studentId, schoolId, 'FIRST_SIMULACRO');
    if (b) newBadges.push(b);
  }

  if (streakActual >= 30) {
    const b = await awardBadge(studentId, schoolId, 'STREAK_30');
    if (b) newBadges.push(b);
  }
  if (streakActual >= 7) {
    const b = await awardBadge(studentId, schoolId, 'STREAK_7');
    if (b) newBadges.push(b);
  }

  let hasAnyPerfect = false;
  let hasImprovement = false;

  for (const [area, score] of Object.entries(resultadoPorArea)) {
    const s = Number(score);
    if (s >= 80) {
      const b = await awardBadge(studentId, schoolId, `MASTERY_${area}`);
      if (b) newBadges.push(b);
    }
    if (s >= 100) hasAnyPerfect = true;
    if (previousScores[area] !== undefined && s - Number(previousScores[area]) >= 10) {
      hasImprovement = true;
    }
  }

  if (hasAnyPerfect) {
    const b = await awardBadge(studentId, schoolId, 'FIRST_PERFECT');
    if (b) newBadges.push(b);
  }
  if (hasImprovement) {
    const b = await awardBadge(studentId, schoolId, 'IMPROVEMENT_10');
    if (b) newBadges.push(b);
  }

  return newBadges;
};

const getBadges = async (studentId) =>
  prisma.studentBadge.findMany({ where: { studentId }, orderBy: { earnedAt: 'desc' } });

const markBadgesAsSeen = async (badgeIds) => {
  if (!badgeIds || !badgeIds.length) return;
  await prisma.studentBadge.updateMany({
    where: { id: { in: badgeIds }, seenAt: null },
    data: { seenAt: new Date() }
  });
};

module.exports = { checkAndAwardBadges, getBadges, markBadgesAsSeen };
