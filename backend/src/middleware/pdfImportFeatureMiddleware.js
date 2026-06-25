const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');

const requirePdfImportFeature = async (req, _res, next) => {
  try {
    if (req.user?.role === 'admin') return next();

    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return next(new ApiError(403, 'Forbidden', ['Usuario sin institución asignada']));
    }

    const config = await prisma.systemConfig.findUnique({
      where: { schoolId },
      select: { featureOcrGlobal: true }
    });

    // null config → school hasn't customised yet → default is enabled (schema default: true)
    const schoolEnabled = config === null || config.featureOcrGlobal !== false;
    const userEnabled = req.user?.featureOcrEnabled !== false;

    if (!schoolEnabled || !userEnabled) {
      return next(new ApiError(403, 'Forbidden', ['PDF import feature is disabled for this user']));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { requirePdfImportFeature };
