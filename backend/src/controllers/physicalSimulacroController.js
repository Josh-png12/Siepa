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

module.exports = {
  createPhysicalSimulacroDraft,
  getStudentPhysicalEvaluation
};
