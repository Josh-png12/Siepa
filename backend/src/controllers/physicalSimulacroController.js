const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const service = require('../services/physicalSimulacroService');

const createPhysicalSimulacro = asyncHandler(async (req, res) => {
  const simulacro = await service.createAdminPhysicalSimulacro({
    userId: req.user.id,
    schoolId: req.user.schoolId,
    payload: req.body
  });

  return successResponse(res, {
    statusCode: 201,
    message: 'Physical simulacro creado',
    data: simulacro
  });
});

const listPhysicalSimulacros = asyncHandler(async (req, res) => {
  const result = await service.listTeacherOcrSimulacros({ user: req.user, query: req.query });
  return successResponse(res, { data: result, message: 'Simulacros cargados' });
});

const getPhysicalSimulacro = asyncHandler(async (req, res) => {
  const result = await service.getTeacherOcrSimulacroDetail({
    user: req.user,
    simulacroId: req.params.id
  });
  return successResponse(res, { data: result, message: 'Simulacro cargado' });
});

const generatePdfs = asyncHandler(async (req, res) => {
  const result = await service.generateSimulacroSheets({
    simulacroId: req.params.id,
    user: req.user,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  return successResponse(res, {
    statusCode: 200,
    message: `PDFs generados para ${result.totalStudents} estudiantes`,
    data: result
  });
});

const getStudentPhysicalEvaluation = asyncHandler(async (_req, _res) => {
  throw new ApiError(501, 'NotImplemented');
});

const getReviewStats = asyncHandler(async (req, res) => {
  const result = await service.getTeacherOcrSimulacroDetail({
    user: req.user,
    simulacroId: req.params.id
  });
  return successResponse(res, { data: result.summary, message: 'Stats cargados' });
});

const publishResults = asyncHandler(async (req, res) => {
  const result = await service.publishTeacherOcrResults({
    user: req.user,
    simulacroId: req.params.id
  });
  return successResponse(res, { data: result, message: 'Resultados publicados' });
});

const processScan = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'ValidationError', ['scanFile is required']);

  const result = await service.uploadTeacherOcrSheets({
    user: req.user,
    simulacroId: req.params.id,
    files: [req.file],
    pagePayloadsByFileName: null
  });

  return successResponse(res, {
    statusCode: 200,
    message: 'Escaneo en cola de procesamiento',
    data: result
  });
});

module.exports = {
  createPhysicalSimulacro,
  listPhysicalSimulacros,
  getPhysicalSimulacro,
  generatePdfs,
  getStudentPhysicalEvaluation,
  getReviewStats,
  publishResults,
  processScan
};
