const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const simulacroController = require('../controllers/simulacroController');

const router = express.Router();

router.use(protect);

// Student routes
router.get('/available', roleCheck('estudiante'), simulacroController.getAvailableSimulacros);
router.post('/:id/start', roleCheck('estudiante'), simulacroController.startSimulacro);
router.post('/:id/submit', roleCheck('estudiante'), simulacroController.submitSimulacro);
router.get('/:id/results', roleCheck('estudiante'), simulacroController.getStudentResults);

// Teacher routes
router.post('/manual', roleCheck('docente'), simulacroController.createManualSimulacro);
router.post('/auto', roleCheck('docente'), simulacroController.createSmartSimulacro);
router.get('/', roleCheck('docente'), simulacroController.getSimulacros);
router.get('/:id', roleCheck('docente'), simulacroController.getSimulacroById);
router.put('/:id', roleCheck('docente'), simulacroController.updateSimulacro);
router.put('/:id/publish', roleCheck('docente'), simulacroController.publishSimulacro);
router.delete('/:id', roleCheck('docente'), simulacroController.deleteSimulacro);

module.exports = router;
