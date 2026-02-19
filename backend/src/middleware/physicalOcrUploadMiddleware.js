const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const toSafeSegment = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

const allowedMimeTypes = new Set(['application/pdf']);

const buildDestination = (req) => {
  const simulacroId = toSafeSegment(req.params.id);
  if (!simulacroId) throw new ApiError(400, 'Invalid simulacro id for upload path');

  const uploadDir = path.join(process.cwd(), 'uploads', 'physical-simulacros', simulacroId);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, buildDestination(req));
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.pdf').toLowerCase();
    const fileName = `${Date.now()}-${crypto.randomUUID()}${ext === '.pdf' ? '.pdf' : '.bin'}`;
    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new ApiError(400, 'Only PDF uploads are supported'));
    }

    return cb(null, true);
  }
});

const ocrUploadMiddleware = upload.array('files', 30);

module.exports = {
  ocrUploadMiddleware,
  MAX_UPLOAD_SIZE_MB
};
