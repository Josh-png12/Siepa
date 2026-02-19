const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, required: true, trim: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { timestamps: false }
);

auditLogSchema.index({ institutionId: 1, userId: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
