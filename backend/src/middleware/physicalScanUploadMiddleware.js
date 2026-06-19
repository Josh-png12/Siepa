const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Store under uploads/physical-simulacros/:id/ so parsePDF's path check passes
    const simulacroId = req.params.id || 'unknown';
    const dir = path.join(process.cwd(), 'uploads', 'physical-simulacros', simulacroId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const scanUpload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Escaneo debe ser PDF o imagen (PNG/JPG)'));
    }

    return cb(null, true);
  }
});

module.exports = {
  scanUpload
};
