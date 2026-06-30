const { successResponse, errorResponse } = require('../utils/response');
const adminService = require('../services/adminService');
const sandboxService = require('../services/sandboxService');
const { logAudit } = require('../services/auditLogService');
const { generateInstitutionReportPdf } = require('../services/adminReportService');

const handle = async (res, callback) => {
  try {
    const data = await callback();
    return successResponse(res, { data });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'InternalError',
      errors: error.errors
    });
  }
};

const audit = async (req, payload) => logAudit({
  schoolId: req.user.schoolId,
  userId: req.user.id,
  ...payload
});

const listUsers = (req, res) => handle(res, async () => {
  const data = await adminService.listUsers({
    schoolId: req.user.schoolId,
    query: req.query
  });
  await audit(req, { action: 'admin.users.list', entityType: 'User', entityId: 'list', metadata: req.query });
  return data;
});

const createUser = (req, res) => handle(res, async () => {
  const user = await adminService.createUser({
    schoolId: req.user.schoolId,
    payload: req.body
  });
  await audit(req, { action: 'admin.users.create', entityType: 'User', entityId: user.id, metadata: { role: user.role } });
  return user;
});

const patchUser = (req, res) => handle(res, async () => {
  const user = await adminService.updateUser({
    schoolId: req.user.schoolId,
    userId: req.params.id,
    payload: req.body
  });
  await audit(req, { action: 'admin.users.patch', entityType: 'User', entityId: user.id, metadata: req.body });
  return user;
});

const deleteUser = (req, res) => handle(res, async () => {
  const user = await adminService.softDeleteUser({
    schoolId: req.user.schoolId,
    userId: req.params.id
  });
  await audit(req, { action: 'admin.users.delete', entityType: 'User', entityId: user.id, metadata: { softDelete: true } });
  return user;
});

const resetUserPassword = (req, res) => handle(res, async () => {
  const user = await adminService.resetUserPassword({
    schoolId: req.user.schoolId,
    userId: req.params.id,
    newPassword: req.body.newPassword
  });
  await audit(req, { action: 'admin.users.reset-password', entityType: 'User', entityId: user.id, metadata: {} });
  return user;
});

const importUsers = (req, res) => handle(res, async () => {
  const result = await adminService.importUsers({
    schoolId: req.user.schoolId,
    fileBuffer: req.file?.buffer
  });
  await audit(req, { action: 'admin.users.import', entityType: 'User', entityId: 'bulk', metadata: result });
  return result;
});

const listCourses = (req, res) => handle(res, async () => {
  const data = await adminService.listCourses({ schoolId: req.user.schoolId, query: req.query });
  await audit(req, { action: 'admin.courses.list', entityType: 'Course', entityId: 'list', metadata: req.query });
  return data;
});

const createCourse = (req, res) => handle(res, async () => {
  const course = await adminService.createCourse({ schoolId: req.user.schoolId, payload: req.body });
  await audit(req, { action: 'admin.courses.create', entityType: 'Course', entityId: course.id, metadata: { name: course.name } });
  return course;
});

const patchCourse = (req, res) => handle(res, async () => {
  const course = await adminService.updateCourse({
    schoolId: req.user.schoolId,
    courseId: req.params.id,
    payload: req.body
  });
  await audit(req, { action: 'admin.courses.patch', entityType: 'Course', entityId: course.id, metadata: req.body });
  return course;
});

const deleteCourse = (req, res) => handle(res, async () => {
  const course = await adminService.softDeleteCourse({
    schoolId: req.user.schoolId,
    courseId: req.params.id
  });
  await audit(req, { action: 'admin.courses.delete', entityType: 'Course', entityId: course.id, metadata: { softDelete: true } });
  return course;
});

const assignTeacher = (req, res) => handle(res, async () => {
  const course = await adminService.assignTeacher({
    schoolId: req.user.schoolId,
    courseId: req.params.id,
    teacherId: req.body.teacherId
  });
  await audit(req, {
    action: 'admin.courses.assign-teacher',
    entityType: 'Course',
    entityId: course.id,
    metadata: { teacherId: req.body.teacherId },
    courseId: course.id
  });
  return course;
});

const assignStudents = (req, res) => handle(res, async () => {
  const course = await adminService.assignStudents({
    schoolId: req.user.schoolId,
    courseId: req.params.id,
    studentIds: req.body.studentIds
  });
  await audit(req, {
    action: 'admin.courses.assign-students',
    entityType: 'Course',
    entityId: course.id,
    metadata: { count: (req.body.studentIds || []).length },
    courseId: course.id
  });
  return course;
});

const listQuestions = (req, res) => handle(res, async () => {
  const data = await adminService.listQuestions({ schoolId: req.user.schoolId, query: req.query });
  await audit(req, { action: 'admin.questions.list', entityType: 'Question', entityId: 'list', metadata: req.query });
  return data;
});

const questionStatsByArea = (req, res) => handle(res, async () => {
  const data = await adminService.getQuestionStatsByArea({ schoolId: req.user.schoolId });
  await audit(req, { action: 'admin.questions.stats-area', entityType: 'Question', entityId: 'aggregate', metadata: {} });
  return data;
});

const approveQuestion = (req, res) => handle(res, async () => {
  const question = await adminService.moderateQuestion({
    schoolId: req.user.schoolId,
    questionId: req.params.id,
    action: 'approve'
  });
  await audit(req, { action: 'admin.questions.approve', entityType: 'Question', entityId: question.id, metadata: {} });
  return question;
});

const rejectQuestion = (req, res) => handle(res, async () => {
  const question = await adminService.moderateQuestion({
    schoolId: req.user.schoolId,
    questionId: req.params.id,
    action: 'reject'
  });
  await audit(req, { action: 'admin.questions.reject', entityType: 'Question', entityId: question.id, metadata: {} });
  return question;
});

const patchTriParams = (req, res) => handle(res, async () => {
  const question = await adminService.updateQuestionTriParams({
    schoolId: req.user.schoolId,
    questionId: req.params.id,
    triParams: req.body
  });
  await audit(req, { action: 'admin.questions.tri-params', entityType: 'Question', entityId: question.id, metadata: req.body });
  return question;
});

const listPhysicalSimulacros = (req, res) => handle(res, async () => {
  const data = await adminService.listPhysicalSimulacros({ schoolId: req.user.schoolId, query: req.query });
  await audit(req, { action: 'admin.physical-simulacros.list', entityType: 'PhysicalSimulacro', entityId: 'list', metadata: req.query });
  return data;
});

const listGovernanceSimulacros = (req, res) => handle(res, async () => {
  const data = await adminService.listGovernanceSimulacros({
    schoolId: req.user.schoolId,
    query: req.query
  });
  await audit(req, { action: 'admin.simulacros.list', entityType: 'Simulacro', entityId: 'list', metadata: req.query });
  return data;
});

const createPhysicalSimulacro = (req, res) => handle(res, async () => {
  const doc = await adminService.createPhysicalSimulacro({
    schoolId: req.user.schoolId,
    payload: req.body
  });
  await audit(req, { action: 'admin.physical-simulacros.create', entityType: 'PhysicalSimulacro', entityId: doc.id, metadata: { title: doc.title } });
  return doc;
});

const forcePublishPhysical = (req, res) => handle(res, async () => {
  const doc = await adminService.updatePhysicalSimulacroStatus({
    schoolId: req.user.schoolId,
    simulacroId: req.params.id,
    status: 'published'
  });
  await audit(req, { action: 'admin.physical-simulacros.force-publish', entityType: 'PhysicalSimulacro', entityId: doc.id, metadata: {} });
  return doc;
});

const forceArchivePhysical = (req, res) => handle(res, async () => {
  const doc = await adminService.updatePhysicalSimulacroStatus({
    schoolId: req.user.schoolId,
    simulacroId: req.params.id,
    status: 'archived'
  });
  await audit(req, { action: 'admin.physical-simulacros.force-archive', entityType: 'PhysicalSimulacro', entityId: doc.id, metadata: {} });
  return doc;
});

const forceArchiveSimulacro = (req, res) => handle(res, async () => {
  const doc = await adminService.forceArchiveSimulacro({
    schoolId: req.user.schoolId,
    simulacroId: req.params.id,
    type: req.body.type || req.query.type || 'virtual'
  });
  await audit(req, { action: 'admin.simulacros.force-archive', entityType: 'Simulacro', entityId: doc.id, metadata: { type: req.body.type || req.query.type } });
  return doc;
});

const reopenReviewPhysical = (req, res) => handle(res, async () => {
  const doc = await adminService.updatePhysicalSimulacroStatus({
    schoolId: req.user.schoolId,
    simulacroId: req.params.id,
    status: 'reviewing'
  });
  await audit(req, { action: 'admin.physical-simulacros.reopen-review', entityType: 'PhysicalSimulacro', entityId: doc.id, metadata: {} });
  return doc;
});

const listPhysicalTemplates = (req, res) => handle(res, async () => {
  const data = await adminService.listPhysicalTemplates({ schoolId: req.user.schoolId });
  await audit(req, { action: 'admin.physical-templates.list', entityType: 'PhysicalTemplate', entityId: 'list', metadata: {} });
  return data;
});

const createPhysicalTemplate = (req, res) => handle(res, async () => {
  const payload = {
    ...req.body,
    createdBy: req.user.id,
    coordinateJSON: req.body.coordinateJSON ? JSON.parse(req.body.coordinateJSON) : {}
  };
  const doc = await adminService.createPhysicalTemplate({
    schoolId: req.user.schoolId,
    payload,
    file: req.file
  });
  await audit(req, { action: 'admin.physical-templates.create', entityType: 'PhysicalTemplate', entityId: doc.id, metadata: { version: doc.version } });
  return doc;
});

const patchPhysicalTemplate = (req, res) => handle(res, async () => {
  const payload = { ...req.body };
  if (payload.coordinateJSON && typeof payload.coordinateJSON === 'string') {
    payload.coordinateJSON = JSON.parse(payload.coordinateJSON);
  }
  const doc = await adminService.updatePhysicalTemplate({
    schoolId: req.user.schoolId,
    templateId: req.params.id,
    payload
  });
  await audit(req, { action: 'admin.physical-templates.patch', entityType: 'PhysicalTemplate', entityId: doc.id, metadata: req.body });
  return doc;
});

const deletePhysicalTemplate = (req, res) => handle(res, async () => {
  const doc = await adminService.deletePhysicalTemplate({
    schoolId: req.user.schoolId,
    templateId: req.params.id
  });
  await audit(req, { action: 'admin.physical-templates.delete', entityType: 'PhysicalTemplate', entityId: doc.id, metadata: {} });
  return doc;
});

const getConfig = (req, res) => handle(res, async () => {
  const config = await adminService.getSystemConfig({ schoolId: req.user.schoolId });
  await audit(req, { action: 'admin.config.get', entityType: 'SystemConfig', entityId: String(config?.id || req.user.schoolId), metadata: {} });
  return config;
});

const patchConfig = (req, res) => handle(res, async () => {
  const config = await adminService.updateSystemConfig({
    schoolId: req.user.schoolId,
    payload: req.body
  });
  await audit(req, { action: 'admin.config.patch', entityType: 'SystemConfig', entityId: String(config?.id || req.user.schoolId), metadata: req.body });
  return config;
});

const listAuditLogs = (req, res) => handle(res, async () => {
  const data = await adminService.getAuditLogs({
    schoolId: req.user.schoolId,
    query: req.query
  });
  await audit(req, { action: 'admin.audit.list', entityType: 'AuditLog', entityId: 'list', metadata: req.query });
  return data;
});

const getGovernanceStats = (req, res) => handle(res, async () => {
  const data = await adminService.getGovernanceStats({
    schoolId: req.user.schoolId,
    forceRefresh: req.query.refresh === 'true'
  });
  await audit(req, { action: 'admin.governance.stats', entityType: 'PhysicalAnswerSheet', entityId: 'aggregate', metadata: req.query });
  return data;
});

const getInstitutionMetrics = (req, res) => handle(res, async () => {
  const data = await adminService.getInstitutionMetrics({
    schoolId: req.user.schoolId,
    forceRefresh: req.query.refresh === 'true'
  });
  await audit(req, { action: 'admin.analytics.institution', entityType: 'InstitutionMetrics', entityId: String(data?.id || 'snapshot'), metadata: req.query });
  return data;
});

const getInstitutionReport = (req, res) => handle(res, async () => {
  const schoolId = req.user.schoolId;
  const [metrics, governance] = await Promise.all([
    adminService.getInstitutionMetrics({ schoolId, forceRefresh: req.query.refresh === 'true' }),
    adminService.getGovernanceStats({ schoolId, forceRefresh: req.query.refresh === 'true' })
  ]);

  const pdf = generateInstitutionReportPdf({ schoolId, metrics, governance });

  await audit(req, { action: 'admin.reports.institution', entityType: 'InstitutionMetrics', entityId: String(metrics?.id || 'snapshot'), metadata: {} });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-institucional-siepa.pdf"');
  res.status(200).send(pdf);
  return null;
});

const listTeachersLegacy = async (req, res) => {
  req.query.role = 'docente';
  const data = await adminService.listUsers({
    schoolId: req.user.schoolId,
    query: req.query
  });
  await audit(req, { action: 'admin.teachers.list', entityType: 'User', entityId: 'list', metadata: {} });
  return res.json({ success: true, teachers: data.items });
};

const updateTeacherFeaturesLegacy = async (req, res) => {
  try {
    const teacher = await adminService.updateUser({
      schoolId: req.user.schoolId,
      userId: req.params.id || req.params.teacherId,
      payload: {
        features: {
          physicalSimulacros: Boolean(req.body?.physicalSimulacros),
          ocrEnabled: req.body?.ocrEnabled
        }
      }
    });
    await audit(req, {
      action: 'admin.teachers.update-feature',
      entityType: 'User',
      entityId: teacher.id,
      metadata: { features: teacher.features }
    });
    return res.json({ success: true, teacher });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'InternalError'
    });
  }
};

const getActiveTemplateLegacy = async (req, res) => {
  try {
    const templates = await adminService.listPhysicalTemplates({ schoolId: req.user.schoolId });
    const active = templates.find((item) => item.isActive) || null;
    await audit(req, { action: 'admin.physical-template.active', entityType: 'PhysicalTemplate', entityId: active?.id || 'none', metadata: {} });
    return res.json({ success: true, template: active });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'InternalError'
    });
  }
};

const generateSandboxSheet = (req, res) => handle(res, async () => {
  console.log('[SANDBOX] body recibido:', JSON.stringify(req.body));
  const { studentId, session } = req.body || {};
  if (!studentId) throw { status: 400, message: 'studentId es requerido' };
  return sandboxService.generateTestSheet({ adminUser: req.user, studentId, session });
});

const getSandboxResults = (req, res) => handle(res, async () =>
  sandboxService.getSandboxResults({ adminUser: req.user, simulacroId: req.params.simulacroId })
);

const listSandboxSimulacros = (req, res) => handle(res, async () =>
  sandboxService.listSandboxSimulacros({ adminUser: req.user })
);

module.exports = {
  listUsers,
  createUser,
  patchUser,
  deleteUser,
  resetUserPassword,
  importUsers,
  listCourses,
  createCourse,
  patchCourse,
  deleteCourse,
  assignTeacher,
  assignStudents,
  listQuestions,
  questionStatsByArea,
  approveQuestion,
  rejectQuestion,
  patchTriParams,
  listPhysicalSimulacros,
  listGovernanceSimulacros,
  createPhysicalSimulacro,
  forcePublishPhysical,
  forceArchivePhysical,
  forceArchiveSimulacro,
  reopenReviewPhysical,
  listPhysicalTemplates,
  createPhysicalTemplate,
  patchPhysicalTemplate,
  deletePhysicalTemplate,
  getConfig,
  patchConfig,
  listAuditLogs,
  getGovernanceStats,
  getInstitutionMetrics,
  getInstitutionReport,
  listTeachersLegacy,
  updateTeacherFeaturesLegacy,
  getActiveTemplateLegacy,
  generateSandboxSheet,
  getSandboxResults,
  listSandboxSimulacros
};
