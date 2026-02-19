const AuditLog = require('../models/AuditLog');

const logAudit = async ({
  institutionId = 'default',
  userId,
  action,
  entityType,
  entityId,
  courseId = null,
  metadata = {}
}) => {
  if (!userId || !action || !entityType || !entityId) return null;

  return AuditLog.create({
    institutionId,
    userId,
    action,
    entityType,
    entityId: String(entityId),
    courseId,
    metadata,
    timestamp: new Date()
  });
};

module.exports = {
  logAudit
};
