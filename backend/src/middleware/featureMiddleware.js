const ApiError = require('../utils/ApiError');

const requirePhysicalSimulacrosFeature = (req, _res, next) => {
  if (req.user?.role === 'admin') return next();

  const enabled = Boolean(req.user?.features?.physicalSimulacros);
  if (!enabled) {
    return next(new ApiError(403, 'Forbidden', ['physicalSimulacros feature is disabled for this teacher']));
  }

  return next();
};

module.exports = {
  requirePhysicalSimulacrosFeature
};
