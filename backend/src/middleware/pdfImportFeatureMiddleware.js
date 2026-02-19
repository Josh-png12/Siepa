const SystemConfig = require('../models/SystemConfig');
const ApiError = require('../utils/ApiError');

const requirePdfImportFeature = async (req, _res, next) => {
  try {
    if (req.user?.role === 'admin') return next();

    const institutionId = String(req.user?.institutionId || 'default').trim() || 'default';
    req.institutionId = institutionId;

    const config = await SystemConfig.findOne({ institutionId })
      .select('featuresEnabled.ocrGlobal featuresEnabled.questionModeration')
      .lean();

    const enabled = Boolean(
      req.user?.features?.questionModeration ||
      req.user?.features?.ocrEnabled ||
      config?.featuresEnabled?.ocrGlobal ||
      config?.featuresEnabled?.questionModeration
    );

    if (!enabled) {
      return next(new ApiError(403, 'Forbidden', ['PDF import feature is disabled for this user']));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  requirePdfImportFeature
};
