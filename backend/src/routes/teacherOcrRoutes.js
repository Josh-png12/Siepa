const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { requirePhysicalSimulacrosFeature } = require('../middleware/featureMiddleware');
const { limitOcrUploads } = require('../middleware/ocrRateLimitMiddleware');
const { ocrUploadMiddleware } = require('../middleware/physicalOcrUploadMiddleware');
const ocrController = require('../controllers/ocrController');

const router = express.Router();

router.use(protect);
router.use(roleCheck('docente', 'admin'));
router.use(requirePhysicalSimulacrosFeature);

router.get('/', ocrController.listTeacherOcr);
router.get('/:id', ocrController.getTeacherOcrDetail);
router.post('/:id/upload', limitOcrUploads, ocrUploadMiddleware, ocrController.uploadTeacherOcr);
router.post('/:id/review', ocrController.reviewTeacherOcr);
router.post('/:id/publish', ocrController.publishTeacherOcr);
router.post('/:id/archive', ocrController.archiveTeacherOcr);

module.exports = router;
