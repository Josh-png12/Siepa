const express = require('express');
const { protect, roleCheck } = require('../middleware/authMiddleware');
const { create, get } = require('../controllers/bookletController');

const router = express.Router();

router.use(protect);
router.post('/', roleCheck(['docente']), create);
router.get('/:id', get);

module.exports = router;