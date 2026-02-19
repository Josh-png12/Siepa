const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(process.cwd(), 'uploads', 'physical-templates');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const maxUploadMB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname || '.pdf').toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`);
  }
});

const templateUpload = multer({
  storage,
  limits: { fileSize: maxUploadMB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('La plantilla base debe ser PDF'));
    }

    return cb(null, true);
  }
});

module.exports = {
  templateUpload
};
