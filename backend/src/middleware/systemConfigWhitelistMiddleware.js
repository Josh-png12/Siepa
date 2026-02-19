const whitelistSystemConfigPatch = (req, _res, next) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  const nextPayload = {};
  if (payload.maxUploadMB !== undefined) nextPayload.maxUploadMB = payload.maxUploadMB;
  if (payload.ocrReviewWindowDays !== undefined) nextPayload.ocrReviewWindowDays = payload.ocrReviewWindowDays;
  if (payload.fileRetentionDays !== undefined) nextPayload.fileRetentionDays = payload.fileRetentionDays;

  const features = payload.featuresEnabled && typeof payload.featuresEnabled === 'object'
    ? payload.featuresEnabled
    : null;

  if (features) {
    nextPayload.featuresEnabled = {};
    if (features.physicalSimulacrosGlobal !== undefined) {
      nextPayload.featuresEnabled.physicalSimulacrosGlobal = features.physicalSimulacrosGlobal;
    }
    if (features.ocrGlobal !== undefined) {
      nextPayload.featuresEnabled.ocrGlobal = features.ocrGlobal;
    }
    if (features.questionModeration !== undefined) {
      nextPayload.featuresEnabled.questionModeration = features.questionModeration;
    }
    if (!Object.keys(nextPayload.featuresEnabled).length) {
      delete nextPayload.featuresEnabled;
    }
  }

  req.body = nextPayload;
  return next();
};

module.exports = {
  whitelistSystemConfigPatch
};
