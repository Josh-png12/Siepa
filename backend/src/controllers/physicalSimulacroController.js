const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const service = require('../services/physicalSimulacroService');

const createPhysicalSimulacroDraft = asyncHandler(async (req, res) => {
  const simulacro = await service.createAdminPhysicalSimulacro({
    userId: req.user.id,
    payload: req.body
  });

  return successResponse(res, {
    statusCode: 201,
    message: 'Physical simulacro draft created',
    data: simulacro
  });
});

const getStudentPhysicalEvaluation = asyncHandler(async (req, res) => {
  throw new ApiError(501, 'NotImplemented');
});

const processScan = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'ValidationError', ['scanFile is required']);

  const simulacroId = req.params.id;

  // pagePayloadsByFileName=null → processUploadedFileJob will auto-detect via bubbleDetectionService
  const result = await service.uploadTeacherOcrSheets({
    user: req.user,
    simulacroId,
    files: [req.file],
    pagePayloadsByFileName: null
  });

  return successResponse(res, {
    statusCode: 200,
    message: 'Scan queued for processing',
    data: result
  });
});

module.exports = {
  createPhysicalSimulacroDraft,
  getStudentPhysicalEvaluation,
  processScan
};
