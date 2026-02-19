const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const questionController = require('../controllers/questionController');

const router = express.Router();

router.use(protect);
router.use(roleCheck(['docente', 'admin']));

router.post('/batch/import', questionController.uploadImportFile, questionController.importBatch);
router.post('/import/excel', questionController.uploadImportFile, questionController.importExcel);

router.get('/', questionController.getQuestions);
router.post('/', questionController.uploadQuestionAssets, questionController.createQuestion);

router.post('/stats/update', questionController.updateStats);

router.get('/:id/versions', questionController.getVersions);
router.post('/:id/versions/:versionId/restore', questionController.restoreVersion);

router.get('/:id', questionController.getQuestionById);
router.put('/:id', questionController.uploadQuestionAssets, questionController.updateQuestion);
router.delete('/:id', questionController.deleteQuestion);
router.post('/:id/publish', questionController.publishQuestion);

module.exports = router;
