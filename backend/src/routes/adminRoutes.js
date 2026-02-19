const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const { requireAdminInstitutionScope } = require('../middleware/adminAccessMiddleware');
const { sanitizeInput } = require('../middleware/sanitizeInputMiddleware');
const { normalizeQuery } = require('../middleware/normalizeQuery');
const { whitelistSystemConfigPatch } = require('../middleware/systemConfigWhitelistMiddleware');
const { heavyAdminRateLimit, reportRateLimit } = require('../middleware/adminRateLimitMiddleware');
const { validateObjectIdParam } = require('../middleware/objectIdMiddleware');
const { templateUpload } = require('../middleware/templateUploadMiddleware');
const { validateBody, validateQuery } = require('../validators/adminRequestValidators');
const adminController = require('../controllers/adminController');

const router = express.Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

router.use(protect);
router.use(requireAdminInstitutionScope);
router.use(sanitizeInput);
router.use(normalizeQuery);

const paginationQuerySchema = {
  page: { type: 'number' },
  limit: { type: 'number' }
};

// USERS
router.get('/users', validateQuery({
  ...paginationQuerySchema,
  role: { type: 'string', enum: ['admin', 'docente', 'estudiante'] },
  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
  course: { type: 'objectId' },
  search: { type: 'string' },
  q: { type: 'string' }
}), adminController.listUsers);
router.post('/users', validateBody({
  name: { type: 'string', required: true, nonEmpty: true },
  email: { type: 'string', required: true, nonEmpty: true },
  password: { type: 'string', required: true, minLength: 6 },
  role: { type: 'string', required: true, enum: ['docente', 'estudiante', 'admin'] },
  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
  features: {
    type: 'object',
    allowUnknown: false,
    shape: {
      physicalSimulacros: { type: 'boolean' },
      ocrEnabled: { type: 'boolean' }
    }
  }
}), adminController.createUser);
router.patch('/users/:id', validateObjectIdParam('id'), validateBody({
  name: { type: 'string', nonEmpty: true },
  role: { type: 'string', enum: ['docente', 'estudiante', 'admin'] },
  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
  password: { type: 'string', minLength: 6 },
  features: {
    type: 'object',
    allowUnknown: false,
    shape: {
      physicalSimulacros: { type: 'boolean' },
      ocrEnabled: { type: 'boolean' }
    }
  }
}), adminController.patchUser);
router.delete('/users/:id', validateObjectIdParam('id'), adminController.deleteUser);
router.post('/users/:id/reset-password', validateObjectIdParam('id'), validateBody({
  newPassword: { type: 'string', required: true, minLength: 6 }
}), adminController.resetUserPassword);
router.post('/users/import', heavyAdminRateLimit, importUpload.single('file'), adminController.importUsers);

// COURSES
router.get('/courses', validateQuery({
  ...paginationQuerySchema,
  status: { type: 'string', enum: ['active', 'inactive'] },
  teacherId: { type: 'objectId' },
  search: { type: 'string' },
  q: { type: 'string' }
}), adminController.listCourses);
router.post('/courses', validateBody({
  name: { type: 'string', required: true, nonEmpty: true },
  grade: { type: 'string', required: true, nonEmpty: true },
  year: { type: 'string', required: true, nonEmpty: true },
  teacher: { type: 'objectId', required: true },
  students: { type: 'arrayOfObjectId' }
}), adminController.createCourse);
router.patch('/courses/:id', validateObjectIdParam('id'), validateBody({
  name: { type: 'string', nonEmpty: true },
  grade: { type: 'string', nonEmpty: true },
  year: { type: 'string', nonEmpty: true },
  status: { type: 'string', enum: ['active', 'inactive'] }
}), adminController.patchCourse);
router.delete('/courses/:id', validateObjectIdParam('id'), adminController.deleteCourse);
router.post('/courses/:id/assign-teacher', validateObjectIdParam('id'), validateBody({
  teacherId: { type: 'objectId', required: true }
}), adminController.assignTeacher);
router.post('/courses/:id/assign-students', validateObjectIdParam('id'), validateBody({
  studentIds: { type: 'arrayOfObjectId', required: true }
}), adminController.assignStudents);

// QUESTION MODERATION
router.get('/questions', validateQuery({
  ...paginationQuerySchema,
  estado: { type: 'string', enum: ['borrador', 'publicada'] },
  area: { type: 'string' },
  competencia: { type: 'string' },
  createdBy: { type: 'objectId' },
  q: { type: 'string' }
}), adminController.listQuestions);
router.get('/questions/stats/area', adminController.questionStatsByArea);
router.patch('/questions/:id/approve', validateObjectIdParam('id'), adminController.approveQuestion);
router.patch('/questions/:id/reject', validateObjectIdParam('id'), adminController.rejectQuestion);
router.patch('/questions/:id/tri-params', validateObjectIdParam('id'), validateBody({
  a: { type: 'number', required: true },
  b: { type: 'number', required: true },
  c: { type: 'number', required: true }
}), adminController.patchTriParams);

// PHYSICAL SIMULACROS
router.get('/physical-simulacros', validateQuery({
  ...paginationQuerySchema,
  status: { type: 'string' }
}), adminController.listPhysicalSimulacros);
router.post('/physical-simulacros', validateBody({
  title: { type: 'string', required: true, nonEmpty: true },
  description: { type: 'string' },
  teacher: { type: 'objectId', required: true },
  courses: { type: 'arrayOfObjectId', required: true },
  date: { type: 'string', required: true, nonEmpty: true },
  startTime: { type: 'string', required: true, nonEmpty: true },
  endTime: { type: 'string', required: true, nonEmpty: true },
  totalQuestions: { type: 'number', required: true, min: 1, max: 147 },
  reviewDeadline: { type: 'string' }
}), adminController.createPhysicalSimulacro);
router.patch('/physical-simulacros/:id/force-publish', validateObjectIdParam('id'), adminController.forcePublishPhysical);
router.patch('/physical-simulacros/:id/force-archive', validateObjectIdParam('id'), adminController.forceArchivePhysical);
router.patch('/physical-simulacros/:id/reopen-review', validateObjectIdParam('id'), adminController.reopenReviewPhysical);

// SIMULACRO GOVERNANCE (virtual + physical)
router.get('/simulacros', validateQuery({
  ...paginationQuerySchema
}), adminController.listGovernanceSimulacros);
router.patch('/simulacros/:id/force-archive', validateObjectIdParam('id'), validateBody({
  type: { type: 'string', enum: ['virtual', 'physical'] }
}), adminController.forceArchiveSimulacro);

// PHYSICAL TEMPLATES
router.get('/physical-templates', adminController.listPhysicalTemplates);
router.post('/physical-templates', templateUpload.single('template'), validateBody({
  name: { type: 'string', nonEmpty: true },
  version: { type: 'string', nonEmpty: true },
  isActive: { type: 'boolean' },
  coordinateJSON: { type: 'jsonString' }
}), adminController.createPhysicalTemplate);
router.patch('/physical-templates/:id', validateObjectIdParam('id'), validateBody({
  name: { type: 'string', nonEmpty: true },
  version: { type: 'string', nonEmpty: true },
  isActive: { type: 'boolean' },
  coordinateJSON: { type: 'jsonString' }
}), adminController.patchPhysicalTemplate);
router.delete('/physical-templates/:id', validateObjectIdParam('id'), adminController.deletePhysicalTemplate);

// SYSTEM CONFIG
router.get('/config', adminController.getConfig);
router.patch('/config', whitelistSystemConfigPatch, validateBody({
  maxUploadMB: { type: 'number', min: 1, max: 200 },
  ocrReviewWindowDays: { type: 'number', min: 1, max: 90 },
  fileRetentionDays: { type: 'number', min: 1, max: 365 },
  featuresEnabled: {
    type: 'object',
    allowUnknown: false,
    shape: {
      physicalSimulacrosGlobal: { type: 'boolean' },
      ocrGlobal: { type: 'boolean' },
      questionModeration: { type: 'boolean' }
    }
  }
}), adminController.patchConfig);

// GOVERNANCE + ANALYTICS + AUDIT
router.get('/governance/ocr', validateQuery({
  refresh: { type: 'string', enum: ['true', 'false'] }
}), adminController.getGovernanceStats);
router.get('/analytics/institution', heavyAdminRateLimit, validateQuery({
  refresh: { type: 'string', enum: ['true', 'false'] }
}), adminController.getInstitutionMetrics);
router.get('/audit', heavyAdminRateLimit, validateQuery({
  ...paginationQuerySchema,
  userId: { type: 'objectId' },
  action: { type: 'string' },
  entityType: { type: 'string' },
  course: { type: 'objectId' },
  startDate: { type: 'string' },
  endDate: { type: 'string' }
}), adminController.listAuditLogs);

// REPORTS
router.get('/reports/institution', reportRateLimit, validateQuery({
  refresh: { type: 'string', enum: ['true', 'false'] }
}), adminController.getInstitutionReport);

// Backward compatibility for existing UI
router.get('/teachers', adminController.listTeachersLegacy);
router.put('/teachers/:id/features', validateObjectIdParam('id'), validateBody({
  physicalSimulacros: { type: 'boolean', required: true },
  ocrEnabled: { type: 'boolean' }
}), adminController.updateTeacherFeaturesLegacy);
router.put('/teachers/:teacherId/features', validateObjectIdParam('teacherId'), validateBody({
  physicalSimulacros: { type: 'boolean', required: true },
  ocrEnabled: { type: 'boolean' }
}), adminController.updateTeacherFeaturesLegacy);
router.post('/physical-template', templateUpload.single('template'), validateBody({
  name: { type: 'string' },
  version: { type: 'string' },
  isActive: { type: 'boolean' },
  coordinateJSON: { type: 'jsonString' }
}), adminController.createPhysicalTemplate);
router.get('/physical-template/active', adminController.getActiveTemplateLegacy);

module.exports = router;
