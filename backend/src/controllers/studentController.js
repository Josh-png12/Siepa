const { successResponse, errorResponse } = require('../utils/response');
const studentPortalService = require('../services/studentPortalService');
const streakService = require('../services/streakService');
const badgeService = require('../services/badgeService');
const areaProgressService = require('../services/areaProgressService');

const handle = async (res, callback) => {
  try {
    const data = await callback();
    return successResponse(res, { data });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.statusCode || error.status || 500,
      message: error.message || 'InternalError',
      errors: error.errors
    });
  }
};

const getInstitutionId = (req) => String(req.user?.institutionId || 'default').trim() || 'default';

const getOverview = async (req, res) => handle(res, async () => studentPortalService.getStudentOverview({
  studentId: req.user.id,
  institutionId: getInstitutionId(req)
}));

const getSimulacros = async (req, res) => handle(res, async () => studentPortalService.getStudentSimulacros({
  studentId: req.user.id,
  institutionId: getInstitutionId(req),
  status: req.query.status,
  query: req.query
}));

const getResults = async (req, res) => handle(res, async () => studentPortalService.getStudentResults({
  studentId: req.user.id,
  institutionId: getInstitutionId(req),
  scope: req.query.scope || 'all'
}));

const getProgress = async (req, res) => handle(res, async () => studentPortalService.getStudentProgress({
  studentId: req.user.id,
  institutionId: getInstitutionId(req)
}));

const getRanking = async (req, res) => handle(res, async () => studentPortalService.getStudentRanking({
  studentId: req.user.id,
  institutionId: getInstitutionId(req)
}));

const getCompetencias = async (req, res) => handle(res, async () => {
  const progress = await studentPortalService.getStudentProgress({
    studentId: req.user.id,
    institutionId: getInstitutionId(req)
  });
  return { competencias: progress.competencies, risk: progress.risk };
});

// ── Engagement endpoints ───────────────────────────────────────────────────────

const getStreak = async (req, res) => handle(res, async () =>
  streakService.getStreak(req.user.id)
);

const getBadges = async (req, res) => handle(res, async () =>
  badgeService.getBadges(req.user.id)
);

const getAreaProgress = async (req, res) => handle(res, async () =>
  areaProgressService.getAreaProgress(req.user.id)
);

const updateAreaProgressTarget = async (req, res) => handle(res, async () => {
  const { area, targetScore } = req.body || {};
  if (!area) throw Object.assign(new Error('Se requiere area'), { statusCode: 400 });
  return areaProgressService.updateTarget(req.user.id, req.user.schoolId, area, targetScore);
});

// Unified dashboard stats — single call for the student home page.
// Marks unseen badges as seen on read.
const getDashboardStats = async (req, res) => handle(res, async () => {
  const studentId = req.user.id;

  const [streak, allBadges, areaProgress] = await Promise.all([
    streakService.getStreak(studentId),
    badgeService.getBadges(studentId),
    areaProgressService.getAreaProgress(studentId)
  ]);

  const newBadges = allBadges.filter(b => !b.seenAt);
  await badgeService.markBadgesAsSeen(newBadges.map(b => b.id));

  return {
    streak: { current: streak.currentStreak, longest: streak.longestStreak, lastActivityDate: streak.lastActivityDate },
    badges: { total: allBadges.length, recent: allBadges.slice(0, 3) },
    areaProgress,
    newBadges
  };
});

module.exports = {
  getOverview,
  getSimulacros,
  getResults,
  getProgress,
  getRanking,
  getCompetencias,
  getDashboard: getOverview,
  getStreak,
  getBadges,
  getAreaProgress,
  updateAreaProgressTarget,
  getDashboardStats
};
