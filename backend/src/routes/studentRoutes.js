// backend/src/routes/studentRoutes.js
const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { sanitizeInput } = require('../middleware/sanitizeInputMiddleware');
const studentController = require('../controllers/studentController');
const {
  studentSimulacrosQueryValidator,
  studentResultsQueryValidator
} = require('../validators/studentPortalValidators');

const router = express.Router();

router.use(protect);
router.use(roleCheck(['estudiante']));
router.use(sanitizeInput);

router.get('/overview', studentController.getOverview);
router.get('/simulacros', studentSimulacrosQueryValidator, studentController.getSimulacros);
router.get('/results', studentResultsQueryValidator, studentController.getResults);
router.get('/progress', studentController.getProgress);

// Legacy compatibility
router.get('/dashboard', studentController.getOverview);
router.get('/ranking', studentController.getRanking);
router.get('/competencias', studentController.getCompetencias);

module.exports = router;
