const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { explainAnswer, generateQuestionsHandler, createCaseGroupHandler } = require('../controllers/aiController');

const router = express.Router();

router.use(protect);
router.post('/explain-answer', roleCheck('estudiante'), explainAnswer);
router.post('/generate-questions', roleCheck('docente', 'admin'), generateQuestionsHandler);
router.post('/create-case-group', roleCheck('docente', 'admin'), createCaseGroupHandler);

module.exports = router;
