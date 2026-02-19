const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { requirePhysicalSimulacrosFeature } = require('../middleware/featureMiddleware');
const { scanUpload } = require('../middleware/physicalScanUploadMiddleware');
const controller = require('../controllers/physicalSimulacroController');

const router = express.Router();

router.use(protect);

router.get('/student/evaluations/:evaluationId', roleCheck('estudiante'), controller.getStudentPhysicalEvaluation);

router.use(roleCheck('docente', 'admin'));
router.use(requirePhysicalSimulacrosFeature);

router.post('/', controller.createPhysicalSimulacro);
router.get('/', controller.listPhysicalSimulacros);
router.get('/:id', controller.getPhysicalSimulacro);
router.post('/:id/generate-pdfs', controller.generatePdfs);
router.post('/:id/process-scan', scanUpload.single('scanFile'), controller.processScan);
router.get('/:id/review-stats', controller.getReviewStats);
router.post('/:id/publish-results', controller.publishResults);

module.exports = router;
