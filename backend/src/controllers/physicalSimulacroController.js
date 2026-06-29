const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const prisma = require('../config/prisma');
const service = require('../services/physicalSimulacroService');
const statusService = require('../services/simulacroStatusService');

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

// POST /:id/release — coordinator releases results
// Body: { studentIds?: string[] } — omit or send [] to release all PROCESSED
const releaseResults = asyncHandler(async (req, res) => {
  const { studentIds } = req.body || {};
  const simulacroId = req.params.id;
  const tenantId = req.user.schoolId;
  const changedBy = req.user.id;

  if (studentIds && studentIds.length) {
    // Individual releases
    const sheets = await prisma.physicalAnswerSheet.findMany({
      where: {
        physicalSimulacroId: simulacroId,
        studentId: { in: studentIds },
        physicalSimulacro: { schoolId: tenantId }
      },
      select: { id: true }
    });

    if (!sheets.length) {
      throw new ApiError(404, 'NotFound', ['No se encontraron hojas para los estudiantes indicados']);
    }

    let released = 0;
    const errors = [];

    for (const sheet of sheets) {
      try {
        await statusService.transitionStatus({
          sheetId: sheet.id,
          tenantId,
          toStatus: 'RELEASED',
          changedBy
        });
        released++;
      } catch (err) {
        errors.push({ sheetId: sheet.id, error: err.message });
      }
    }

    return successResponse(res, {
      data: { released, errors },
      message: `${released} resultado(s) liberado(s)`
    });
  }

  // Batch release of all PROCESSED
  const result = await statusService.releaseAll({ simulacroId, tenantId, changedBy });

  return successResponse(res, {
    data: result,
    message: `${result.released} resultado(s) liberado(s)`
  });
});

// POST /:id/students/:studentId/status — coordinator transitions a single student
const updateStudentResultStatus = asyncHandler(async (req, res) => {
  const { toStatus, reason } = req.body || {};
  const { id: simulacroId, studentId } = req.params;
  const tenantId = req.user.schoolId;

  if (!toStatus) throw new ApiError(400, 'ValidationError', ['Se requiere toStatus']);

  const sheet = await prisma.physicalAnswerSheet.findFirst({
    where: {
      physicalSimulacroId: simulacroId,
      studentId,
      physicalSimulacro: { schoolId: tenantId }
    },
    select: { id: true }
  });

  if (!sheet) throw new ApiError(404, 'NotFound', ['Hoja del estudiante no encontrada']);

  const updated = await statusService.transitionStatus({
    sheetId: sheet.id,
    tenantId,
    toStatus,
    changedBy: req.user.id,
    reason: reason || null
  });

  return successResponse(res, { data: updated, message: `Estado cambiado a ${toStatus}` });
});

// GET /:id/reconciliation — coordinator status dashboard
const getReconciliation = asyncHandler(async (req, res) => {
  const result = await statusService.getReconciliation({
    simulacroId: req.params.id,
    tenantId: req.user.schoolId
  });
  return successResponse(res, { data: result, message: 'Panel de estados cargado' });
});

// GET /student/evaluations/:evaluationId — student views their own result
// Guard: only visible when resultStatus === 'RELEASED'
const getStudentPhysicalEvaluation = asyncHandler(async (req, res) => {
  const { evaluationId } = req.params;
  const studentId = req.user.id;
  const schoolId = req.user.schoolId;

  const sheet = await prisma.physicalAnswerSheet.findFirst({
    where: {
      id: evaluationId,
      studentId,
      physicalSimulacro: { schoolId }
    },
    include: {
      physicalSimulacro: {
        select: { id: true, title: true, date: true, totalQuestions: true }
      }
    }
  });

  if (!sheet) throw new ApiError(404, 'NotFound', ['Evaluación no encontrada']);

  if (sheet.resultStatus !== 'RELEASED') {
    throw new ApiError(403, 'Forbidden', [
      'Los resultados aún no han sido publicados por tu institución'
    ]);
  }

  return successResponse(res, {
    data: {
      id: sheet.id,
      simulacro: sheet.physicalSimulacro,
      score: sheet.score,
      theta: sheet.theta,
      detectionConfidence: sheet.detectionConfidence,
      parsedAnswers: sheet.parsedAnswers,
      releasedAt: sheet.releasedAt,
      processedAt: sheet.processedAt
    },
    message: 'Resultado de simulacro físico'
  });
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
  releaseResults,
  updateStudentResultStatus,
  getReconciliation,
  processScan
};
