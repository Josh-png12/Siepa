const mongoose = require('mongoose');

const physicalTemplateSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true, trim: true, default: 'v1' },
    pdfBasePath: { type: String, required: true, trim: true },
    coordinateJSON: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
  },
  { timestamps: true }
);

physicalTemplateSchema.index({ institutionId: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('PhysicalTemplate', physicalTemplateSchema);
