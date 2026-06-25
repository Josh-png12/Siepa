const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const simulacroController = require('../controllers/simulacroController');

const router = express.Router();

router.use(protect);

// Student routes (admin can also access for dev/testing)
router.get('/available', roleCheck('estudiante', 'admin'), simulacroController.getAvailableSimulacros);
router.post('/:id/start', roleCheck('estudiante', 'admin'), simulacroController.startSimulacro);
router.post('/:id/submit', roleCheck('estudiante', 'admin'), simulacroController.submitSimulacro);
router.get('/:id/results', roleCheck('estudiante', 'admin'), simulacroController.getStudentResults);

// Teacher routes (admin can also manage simulacros)
router.post('/manual', roleCheck('docente', 'admin'), simulacroController.createManualSimulacro);
router.post('/auto', roleCheck('docente', 'admin'), simulacroController.createSmartSimulacro);
router.get('/', roleCheck('docente', 'admin'), simulacroController.getSimulacros);
router.get('/:id', roleCheck('docente', 'admin'), simulacroController.getSimulacroById);
router.put('/:id', roleCheck('docente', 'admin'), simulacroController.updateSimulacro);
router.put('/:id/publish', roleCheck('docente', 'admin'), simulacroController.publishSimulacro);
router.delete('/:id', roleCheck('docente', 'admin'), simulacroController.deleteSimulacro);

module.exports = router;
