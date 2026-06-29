const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const evaluationController = require('../controllers/evaluationController');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(protect);

// Estudiante puede iniciar y enviar evaluaciones
router.post('/start/:bookletId', evaluationController.startEvaluation);
router.post('/submit/:evaluationId', evaluationController.submitEvaluation);
router.get('/:evaluationId/result', evaluationController.getEvaluationResult);

module.exports = router;
