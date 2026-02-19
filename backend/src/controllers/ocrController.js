const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const service = require('../services/physicalSimulacroService');
const { validateUploadPayload } = require('../validators/ocrValidators');

const parsePagePayloads = (payloadRaw) => {
  if (!payloadRaw) return {};
  if (typeof payloadRaw === 'object') return payloadRaw;
  try {
    return JSON.parse(payloadRaw);
  } catch (_error) {
    return {};
  }
};

const listTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.listTeacherOcrSimulacros({ user: req.user, query: req.query });

  return successResponse(res, {
    data: result,
    message: 'OCR simulacros loaded'
  });
});

const getTeacherOcrDetail = asyncHandler(async (req, res) => {
  const result = await service.getTeacherOcrSimulacroDetail({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'OCR simulacro detail loaded'
  });
});

const uploadTeacherOcr = asyncHandler(async (req, res) => {
  const uploadValidation = validateUploadPayload(req.body);
  if (uploadValidation.errors.length) {
    throw new ApiError(400, 'ValidationError', uploadValidation.errors);
  }

  const result = await service.uploadTeacherOcrSheets({
    user: req.user,
    simulacroId: req.params.id,
    files: req.files || [],
    pagePayloadsByFileName: parsePagePayloads(req.body.pagePayloadsByFileName)
  });

  return successResponse(res, {
    statusCode: 202,
    data: result,
    message: 'OCR files queued for processing'
  });
});

const reviewTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.reviewTeacherOcrSheet({
    user: req.user,
    simulacroId: req.params.id,
    payload: req.body
  });

  return successResponse(res, {
    data: result,
    message: 'Manual correction applied'
  });
});

const publishTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.publishTeacherOcrResults({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'OCR results published'
  });
});

const archiveTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.archiveTeacherOcrSimulacro({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'Physical simulacro archived'
  });
});

module.exports = {
  listTeacherOcr,
  getTeacherOcrDetail,
  uploadTeacherOcr,
  reviewTeacherOcr,
  publishTeacherOcr,
  archiveTeacherOcr
};
