const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { requireAdminInstitutionScope } = require('../middleware/adminAccessMiddleware');
const { sanitizeInput } = require('../middleware/sanitizeInputMiddleware');
const { validateObjectIdParam } = require('../middleware/objectIdMiddleware');
const { limitPdfImportUploads, limitPdfImportConfirm } = require('../middleware/pdfImportRateLimitMiddleware');
const { runPdfUpload } = require('../middleware/pdfImportUploadMiddleware');
const pdfImportController = require('../controllers/pdfImportController');

const router = express.Router();

router.use(protect);
router.use(requireAdminInstitutionScope);
router.use(sanitizeInput);

router.post('/', limitPdfImportUploads, runPdfUpload, pdfImportController.createPdfImport);
router.get('/', pdfImportController.listPdfImports);
router.get('/:id', validateObjectIdParam('id'), pdfImportController.getPdfImport);
router.patch('/:id/preview', validateObjectIdParam('id'), pdfImportController.updatePdfImportPreview);
router.post('/:id/confirm', validateObjectIdParam('id'), limitPdfImportConfirm, pdfImportController.confirmPdfImport);

module.exports = router;
