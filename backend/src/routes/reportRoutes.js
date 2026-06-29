const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { getReport } = require('../controllers/reportController');

const router = express.Router();

router.use(protect);
router.get('/:id', getReport);

module.exports = router;