const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { verifyBubble, verifyQR } = require('../controllers/ocrController');

const router = express.Router();

// POST /api/ocr/verify-qr — service-to-service endpoint for the Python OCR microservice.
// Auth: X-Omr-Service-Key header (no JWT). Validated inside verifyQR controller.
router.post('/verify-qr', verifyQR);

router.use(protect);
router.use(roleCheck('docente', 'admin'));

router.post('/verify-bubble', verifyBubble);

module.exports = router;
