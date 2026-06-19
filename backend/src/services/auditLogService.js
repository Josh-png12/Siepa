const prisma = require('../config/prisma');

const logAudit = async ({
  schoolId,
  userId,
  action,
  entityType,
  entityId,
  courseId = null,
  metadata = {}
}) => {
  if (!userId || !action || !entityType || !entityId) return null;

  return prisma.auditLog.create({
    data: {
      schoolId: schoolId || 'default',
      userId,
      action,
      entityType,
      entityId: String(entityId),
      courseId: courseId || null,
      metadata,
      timestamp: new Date()
    }
  });
};

module.exports = { logAudit };
