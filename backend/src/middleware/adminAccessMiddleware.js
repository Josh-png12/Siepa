const ApiError = require('../utils/ApiError');

const getInstitutionFilter = (institutionId) => ({
  $or: [{ institutionId }, { institutionId: { $exists: false } }]
});

const requireAdminInstitutionScope = (req, _res, next) => {
  if (req.user?.role !== 'admin') {
    return next(new ApiError(403, 'Forbidden', ['Admin role required']));
  }

  const institutionId = String(req.user?.institutionId || 'default').trim() || 'default';
  req.institutionId = institutionId;
  req.institutionFilter = getInstitutionFilter(institutionId);
  return next();
};

module.exports = {
  requireAdminInstitutionScope,
  getInstitutionFilter
};
