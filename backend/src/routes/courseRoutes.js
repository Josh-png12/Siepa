const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { materialUpload } = require('../middleware/materialUploadMiddleware');
const controller = require('../controllers/courseManagementController');

const router = express.Router();

router.use(protect);

// Teacher/Admin
router.post(
  '/:courseId/materials',
  roleCheck('docente', 'admin'),
  materialUpload.single('file'),
  controller.createCourseMaterial
);
router.get('/:courseId/materials', roleCheck('docente', 'admin', 'estudiante'), controller.getCourseMaterials);
router.put(
  '/:courseId/materials/:materialId',
  roleCheck('docente', 'admin'),
  materialUpload.single('file'),
  controller.updateCourseMaterial
);
router.delete('/:courseId/materials/:materialId', roleCheck('docente', 'admin'), controller.deleteCourseMaterial);

router.get('/:courseId/dashboard', roleCheck('docente', 'admin'), controller.getCourseDashboard);
router.get('/:courseId/students', roleCheck('docente', 'admin'), controller.getCourseStudents);
router.get('/:courseId/students/:studentId', roleCheck('docente', 'admin'), controller.getCourseStudentDetail);

// Student
router.get('/:courseId/materials/:materialId/open', roleCheck('estudiante'), controller.openCourseMaterial);
router.post('/:courseId/materials/:materialId/access', roleCheck('estudiante'), controller.logMaterialAccess);

module.exports = router;
