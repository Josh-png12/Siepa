const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', unique: true, index: true },
    maxUploadMB: { type: Number, default: 25, min: 1, max: 200 },
    ocrReviewWindowDays: { type: Number, default: 14, min: 1, max: 90 },
    fileRetentionDays: { type: Number, default: 14, min: 1, max: 365 },
    triConfig: {
      minTheta: { type: Number, default: -3 },
      maxTheta: { type: Number, default: 3 },
      defaultC: { type: Number, default: 0.2 }
    },
    featuresEnabled: {
      physicalSimulacrosGlobal: { type: Boolean, default: true },
      ocrGlobal: { type: Boolean, default: true },
      questionModeration: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
