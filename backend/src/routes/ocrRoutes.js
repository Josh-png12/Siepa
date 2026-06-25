const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { verifyBubble } = require('../controllers/ocrController');

const router = express.Router();

router.use(protect);
router.use(roleCheck('docente', 'admin'));

router.post('/verify-bubble', verifyBubble);

module.exports = router;
