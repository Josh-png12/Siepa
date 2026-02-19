const { successResponse, errorResponse } = require('../utils/response');
const studentPortalService = require('../services/studentPortalService');

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

  return {
    competencias: progress.competencies,
    risk: progress.risk
  };
});

module.exports = {
  getOverview,
  getSimulacros,
  getResults,
  getProgress,
  getRanking,
  getCompetencias,
  getDashboard: getOverview
};
