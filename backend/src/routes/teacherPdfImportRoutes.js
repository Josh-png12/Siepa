const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { sanitizeInput } = require('../middleware/sanitizeInputMiddleware');
const { validateObjectIdParam } = require('../middleware/objectIdMiddleware');
const { limitPdfImportUploads, limitPdfImportConfirm } = require('../middleware/pdfImportRateLimitMiddleware');
const { runPdfUpload, runPdfBatchUpload } = require('../middleware/pdfImportUploadMiddleware');
const { requirePdfImportFeature } = require('../middleware/pdfImportFeatureMiddleware');
const pdfImportController = require('../controllers/pdfImportController');

const router = express.Router();

router.use(protect);
router.use(roleCheck('docente', 'admin'));
router.use(sanitizeInput);
router.use(requirePdfImportFeature);

router.get('/config', pdfImportController.getPdfImportConfig);
router.get('/preview/status/:jobId', pdfImportController.getPdfImportPreviewStatus);
router.post('/preview/cancel/:jobId', pdfImportController.cancelPdfImportPreviewJob);
router.post('/preview', limitPdfImportUploads, runPdfBatchUpload, pdfImportController.previewPdfImportBatch);
router.post('/confirm', limitPdfImportConfirm, pdfImportController.confirmPdfImportBatch);
router.post('/commit', limitPdfImportConfirm, pdfImportController.confirmPdfImportBatch);
router.get('/:batchId', validateObjectIdParam('batchId'), pdfImportController.getPdfImportBatch);

// Legacy endpoints (compat)
router.post('/', limitPdfImportUploads, runPdfUpload, pdfImportController.createPdfImport);
router.get('/', pdfImportController.listPdfImports);
router.patch('/:id/preview', validateObjectIdParam('id'), pdfImportController.updatePdfImportPreview);
router.post('/:id/confirm', validateObjectIdParam('id'), limitPdfImportConfirm, pdfImportController.confirmPdfImport);

module.exports = router;
