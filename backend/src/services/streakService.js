const prisma = require('../config/prisma');

const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const diffDays = (laterDate, earlierDate) =>
  Math.round((laterDate.getTime() - earlierDate.getTime()) / 86400000);

const recordActivity = async (studentId, schoolId) => {
  const now = todayMidnight();

  const existing = await prisma.studentStreak.findUnique({ where: { studentId } });

  if (!existing) {
    return prisma.studentStreak.create({
      data: { studentId, schoolId, currentStreak: 1, longestStreak: 1, lastActivityDate: now }
    });
  }

  // Already counted today — no-op
  if (existing.lastActivityDate) {
    const last = new Date(existing.lastActivityDate);
    last.setHours(0, 0, 0, 0);
    if (diffDays(now, last) === 0) return existing;
  }

  let newCurrent;
  if (!existing.lastActivityDate) {
    newCurrent = 1;
  } else {
    const last = new Date(existing.lastActivityDate);
    last.setHours(0, 0, 0, 0);
    newCurrent = diffDays(now, last) === 1 ? existing.currentStreak + 1 : 1;
  }

  return prisma.studentStreak.update({
    where: { studentId },
    data: {
      currentStreak: newCurrent,
      longestStreak: Math.max(existing.longestStreak, newCurrent),
      lastActivityDate: now
    }
  });
};

const getStreak = async (studentId) => {
  const streak = await prisma.studentStreak.findUnique({ where: { studentId } });
  return streak ?? { studentId, currentStreak: 0, longestStreak: 0, lastActivityDate: null };
};

module.exports = { recordActivity, getStreak };
