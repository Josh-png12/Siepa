const multer = require('multer');
const ApiError = require('../utils/ApiError');
const SystemConfig = require('../models/SystemConfig');

const defaultMaxUploadMB = Number(process.env.MAX_UPLOAD_SIZE_MB || 25);

const resolveInstitutionId = (req) =>
  String(req.institutionId || req.user?.institutionId || 'default').trim() || 'default';

const getMaxUploadMB = async (req) => {
  const institutionId = resolveInstitutionId(req);
  const config = await SystemConfig.findOne({ institutionId }).select('maxUploadMB').lean();
  const parsed = Number(config?.maxUploadMB);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultMaxUploadMB;
  return parsed;
};

const createPdfFileFilter = (_req, file, cb) => {
  const isPdfMime = String(file.mimetype || '').toLowerCase() === 'application/pdf';
  const isPdfExt = /\.pdf$/i.test(String(file.originalname || ''));
  if (isPdfMime || isPdfExt) return cb(null, true);
  return cb(new ApiError(400, 'ValidationError', ['Solo se permiten archivos PDF']));
};

const createSingleUpload = (maxUploadMB) => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadMB * 1024 * 1024,
    files: 1
  },
  fileFilter: createPdfFileFilter
}).single('file');

const createBatchUpload = (maxUploadMB) => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxUploadMB * 1024 * 1024,
    files: 2
  },
  fileFilter: createPdfFileFilter
}).fields([
  { name: 'questionsPdf', maxCount: 1 },
  { name: 'answersPdf', maxCount: 1 }
]);

const runPdfUpload = async (req, res, next) => {
  try {
    const maxUploadMB = await getMaxUploadMB(req);
    const pdfUpload = createSingleUpload(maxUploadMB);

    pdfUpload(req, res, (error) => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, 'ValidationError', [`questionsPdf supera ${maxUploadMB}MB`]));
        }
        return next(error);
      }
      if (!req.file) {
        return next(new ApiError(400, 'ValidationError', ['file es requerido']));
      }
      return next();
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  runPdfUpload,
  runPdfBatchUpload: async (req, res, next) => {
    let maxUploadMB = defaultMaxUploadMB;
    try {
      maxUploadMB = await getMaxUploadMB(req);
    } catch (_error) {
      maxUploadMB = defaultMaxUploadMB;
    }
    const pdfBatchUpload = createBatchUpload(maxUploadMB);

    pdfBatchUpload(req, res, (error) => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(new ApiError(400, 'ValidationError', [`questionsPdf supera ${maxUploadMB}MB`]));
        }
        return next(error);
      }
      if (!req.files?.questionsPdf?.[0]) {
        return next(new ApiError(400, 'ValidationError', ['questionsPdf es requerido']));
      }
      return next();
    });
  }
};
