const fs = require('fs');
const path = require('path');
const multer = require('multer');
const questionService = require('../services/questionService');
const { importQuestionsFromSpreadsheet, cleanupUploadedFile } = require('../services/questionImportService');
const { updateQuestionStatsFromResponses } = require('../services/questionStatsService');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const questionUploadDir = path.join(process.cwd(), 'uploads', 'questions');
const importUploadDir = path.join(process.cwd(), 'uploads', 'imports');
ensureDir(questionUploadDir);
ensureDir(importUploadDir);

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, questionUploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const importStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, importUploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const imageFilter = (_req, file, cb) => {
  if (/^image\/(png|jpeg|jpg|webp)$/i.test(file.mimetype)) {
    return cb(null, true);
  }
  return cb(new Error('Solo se permiten imagenes PNG/JPG/WEBP'));
};

const importFilter = (_req, file, cb) => {
  const allowedExt = /\.(xlsx|csv)$/i.test(file.originalname);
  const allowedMime = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-excel'
  ].includes(file.mimetype);

  if (allowedExt || allowedMime) {
    return cb(null, true);
  }

  return cb(new Error('Archivo invalido. Usa .xlsx o .csv'));
};

const optionImageFields = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label) => ({
  name: `optionImage${label}`,
  maxCount: 1
}));

const uploadQuestionAssets = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 20 }
}).fields([
  { name: 'statementImages', maxCount: 10 },
  ...optionImageFields
]);

const uploadImportFile = multer({
  storage: importStorage,
  fileFilter: importFilter,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 }
}).single('file');

const parsePayload = (req) => {
  if (req.body?.payload) {
    if (typeof req.body.payload === 'string') {
      return JSON.parse(req.body.payload);
    }
    return req.body.payload;
  }
  return req.body || {};
};

const toPublicImage = (file, folder) => ({
  url: `/uploads/${folder}/${file.filename}`,
  caption: ''
});

const attachUploadedAssets = (payload, files) => {
  const next = { ...payload };
  next.statement = next.statement || {};
  next.statement.images = Array.isArray(next.statement.images) ? next.statement.images : [];

  const statementFiles = files?.statementImages || [];
  if (statementFiles.length) {
    next.statement.images = [
      ...next.statement.images,
      ...statementFiles.map((file) => toPublicImage(file, 'questions'))
    ];
  }

  if (!Array.isArray(next.options)) {
    return next;
  }

  next.options = next.options.map((option) => ({ ...option }));

  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach((label) => {
    const key = `optionImage${label}`;
    const file = files?.[key]?.[0];
    if (!file) return;

    const option = next.options.find((item) => String(item.label || '').toUpperCase() === label);
    if (option) {
      option.image = toPublicImage(file, 'questions');
    }
  });

  return next;
};

const sendError = (res, error) => {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || 'Error interno del servidor'
  });
};

const createQuestion = async (req, res) => {
  try {
    const payload = attachUploadedAssets(parsePayload(req), req.files || {});
    const question = await questionService.createQuestion(payload, req.user);
    return res.status(201).json({ success: true, question });
  } catch (error) {
    return sendError(res, error);
  }
};

const getQuestions = async (req, res) => {
  try {
    const result = await questionService.listQuestions(req.query, req.user);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

const getQuestionById = async (req, res) => {
  try {
    const question = await questionService.getQuestionById(req.params.id, req.user);
    return res.json({ success: true, question });
  } catch (error) {
    return sendError(res, error);
  }
};

const updateQuestion = async (req, res) => {
  try {
    const payload = attachUploadedAssets(parsePayload(req), req.files || {});
    const question = await questionService.updateQuestion(req.params.id, payload, req.user);
    return res.json({ success: true, question });
  } catch (error) {
    return sendError(res, error);
  }
};

const deleteQuestion = async (req, res) => {
  try {
    await questionService.deleteQuestion(req.params.id, req.user);
    return res.json({ success: true, message: 'Pregunta eliminada correctamente' });
  } catch (error) {
    return sendError(res, error);
  }
};

const publishQuestion = async (req, res) => {
  try {
    const question = await questionService.publishQuestion(req.params.id, req.user);
    return res.json({ success: true, question });
  } catch (error) {
    return sendError(res, error);
  }
};

const getVersions = async (req, res) => {
  try {
    const versions = await questionService.getQuestionVersions(req.params.id, req.user);
    return res.json({ success: true, versions });
  } catch (error) {
    return sendError(res, error);
  }
};

const restoreVersion = async (req, res) => {
  try {
    const question = await questionService.restoreQuestionVersion({
      questionId: req.params.id,
      versionId: req.params.versionId,
      user: req.user
    });
    return res.json({ success: true, question });
  } catch (error) {
    return sendError(res, error);
  }
};

const importBatch = async (req, res) => {
  try {
    const mapping = req.body?.mapping
      ? typeof req.body.mapping === 'string'
        ? JSON.parse(req.body.mapping)
        : req.body.mapping
      : {};

    const preview = String(req.body?.preview || '').toLowerCase() === 'true';

    const result = await importQuestionsFromSpreadsheet({
      filePath: req.file?.path,
      userId: req.user.id,
      mapping,
      preview
    });

    await cleanupUploadedFile(req.file?.path);

    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    await cleanupUploadedFile(req.file?.path);
    return sendError(res, error);
  }
};

const importExcel = async (req, res) => {
  return importBatch(req, res);
};

const updateStats = async (req, res) => {
  try {
    const result = await updateQuestionStatsFromResponses(req.body?.responses || []);
    return res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports = {
  uploadQuestionAssets,
  uploadImportFile,
  createQuestion,
  getQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  publishQuestion,
  getVersions,
  restoreVersion,
  importBatch,
  importExcel,
  updateStats
};
