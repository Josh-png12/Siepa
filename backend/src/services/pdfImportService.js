const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const PdfImportJob = require('../models/PdfImportJob');
const Question = require('../models/Question');
const SystemConfig = require('../models/SystemConfig');
const { logAudit } = require('./auditLogService');
const pdfImportQueueService = require('./pdfImportQueueService');
const pdfExtractService = require('./pdfExtractService');
const pdfQuestionParserService = require('./pdfQuestionParserService');
const {
  parseListQuery,
  validatePreviewQuestions,
  parseConfirmPayload
} = require('../validators/pdfImportValidators');

const DEFAULT_QUESTION_VALUES = {
  area: 'General',
  competencia: 'General',
  nivelCognitivo: 'comprender',
  dificultadCualitativa: 'media'
};

const ensureObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const toInstitutionId = (value) => String(value || 'default').trim() || 'default';

const safeFileName = (name) => String(name || 'source.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');

const resolveJobDir = (jobId) => path.join(process.cwd(), 'uploads', 'pdf-import', String(jobId));

const getPublicJob = (job) => ({
  _id: job._id,
  institutionId: job.institutionId,
  createdBy: job.createdBy,
  status: job.status,
  pages: job.pages,
  isScanned: job.isScanned,
  ocrEngine: job.ocrEngine,
  source: {
    originalName: job.source?.originalName,
    mimeType: job.source?.mimeType,
    size: job.source?.size
  },
  preview: job.status === 'previewReady' || job.status === 'confirmed' ? job.preview : undefined,
  errors: job.errors || [],
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

const assertJobAccess = ({ job, user, institutionId }) => {
  if (!job) throw new ApiError(404, 'NotFound', ['PDF import job no encontrado']);
  if (job.institutionId !== institutionId) {
    throw new ApiError(403, 'Forbidden', ['No autorizado para esta institucion']);
  }
  if (user.role !== 'admin' && String(job.createdBy) !== String(user.id)) {
    throw new ApiError(403, 'Forbidden', ['No autorizado para este job']);
  }
};

const buildJobError = (error) => ({
  type: error?.name || 'ProcessingError',
  message: error?.message || 'Unexpected PDF import error'
});

const mapPreviewQuestionToQuestionDoc = (previewQuestion, user, institutionId) => {
  const options = (previewQuestion.options || [])
    .map((option) => ({
      label: String(option.label || '').trim().toUpperCase(),
      text: String(option.text || '').trim()
    }))
    .filter((option) => option.label && option.text);

  const correctAnswer = previewQuestion.detectedAnswer
    ? String(previewQuestion.detectedAnswer).trim().toUpperCase()
    : '';

  if (!String(previewQuestion.statement || '').trim()) {
    return { valid: false, reason: 'MISSING_STATEMENT' };
  }

  if (options.length < 4 || options.length > 5) {
    return { valid: false, reason: 'INVALID_OPTIONS_COUNT' };
  }

  if (!correctAnswer || !options.some((option) => option.label === correctAnswer)) {
    return { valid: false, reason: 'INVALID_OR_MISSING_ANSWER' };
  }

  return {
    valid: true,
    doc: {
      institutionId,
      statement: {
        text: String(previewQuestion.statement || '').trim(),
        images: []
      },
      latex: '',
      options,
      correctAnswer,
      area: String(previewQuestion.area || DEFAULT_QUESTION_VALUES.area).trim() || DEFAULT_QUESTION_VALUES.area,
      competencia: String(previewQuestion.competencia || DEFAULT_QUESTION_VALUES.competencia).trim() || DEFAULT_QUESTION_VALUES.competencia,
      nivelCognitivo: String(previewQuestion.nivelCognitivo || DEFAULT_QUESTION_VALUES.nivelCognitivo).trim() || DEFAULT_QUESTION_VALUES.nivelCognitivo,
      dificultadCualitativa: String(previewQuestion.dificultadCualitativa || DEFAULT_QUESTION_VALUES.dificultadCualitativa).trim() || DEFAULT_QUESTION_VALUES.dificultadCualitativa,
      triParams: {
        a: Number.isFinite(Number(previewQuestion?.tri?.a)) ? Number(previewQuestion.tri.a) : 1,
        b: Number.isFinite(Number(previewQuestion?.tri?.b)) ? Number(previewQuestion.tri.b) : 0,
        c: Number.isFinite(Number(previewQuestion?.tri?.c)) ? Number(previewQuestion.tri.c) : 0.2
      },
      visibility: 'private',
      calibrationStatus: 'experimental',
      estado: 'borrador',
      metadata: {
        createdBy: user.id,
        updatedBy: user.id
      },
      currentVersion: 1
    }
  };
};

const getAuditPrefix = (user) => (user?.role === 'admin' ? 'admin' : 'teacher');

const processJob = async (jobId) => {
  const job = await PdfImportJob.findById(jobId);
  if (!job) return null;
  if (!['uploaded', 'extracting', 'parsing'].includes(job.status)) return job;

  try {
    const outputDir = resolveJobDir(job._id);
    await fs.mkdir(outputDir, { recursive: true });

    job.status = 'extracting';
    job.errors = [];
    await job.save();

    const extracted = await pdfExtractService.extract({
      filePath: job.source.filePath,
      outputDir
    });

    const extractedTextPath = path.join(outputDir, 'extracted.txt');
    await fs.writeFile(extractedTextPath, extracted.text, 'utf8');

    job.pages = Number(extracted.pages || 0);
    job.isScanned = Boolean(extracted.isScanned);
    job.ocrEngine = extracted.ocrEngine;
    job.extractedTextPath = extractedTextPath;
    job.status = 'parsing';
    await job.save();

    const parsedJsonPath = path.join(outputDir, 'parsed.json');
    const preview = await pdfQuestionParserService.parseToPreview({
      extractedText: extracted.text,
      parsedJsonPath
    });

    job.parsedJsonPath = parsedJsonPath;
    job.preview = preview;
    job.status = 'previewReady';
    await job.save();
    return job;
  } catch (error) {
    job.status = 'failed';
    job.errors = [...(job.errors || []), buildJobError(error)];
    await job.save();
    return job;
  }
};

pdfImportQueueService.setProcessor(processJob);

const createPdfImportJob = async ({ user, file }) => {
  const institutionId = toInstitutionId(user.institutionId);
  const sourceName = safeFileName(file.originalname || 'source.pdf');
  const created = await PdfImportJob.create({
    institutionId,
    createdBy: user.id,
    status: 'uploaded',
    source: {
      filePath: '',
      originalName: sourceName,
      mimeType: file.mimetype || 'application/pdf',
      size: Number(file.size || 0)
    }
  });

  const jobDir = resolveJobDir(created._id);
  await fs.mkdir(jobDir, { recursive: true });
  const sourcePath = path.join(jobDir, 'source.pdf');
  await fs.writeFile(sourcePath, file.buffer);

  created.source.filePath = sourcePath;
  await created.save();

  await logAudit({
    institutionId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.create`,
    entityType: 'PdfImportJob',
    entityId: created._id,
    metadata: { size: created.source.size, mimeType: created.source.mimeType }
  });

  pdfImportQueueService.enqueue(created._id).catch(() => {});

  return getPublicJob(created);
};

const listPdfImportJobs = async ({ user, query }) => {
  const institutionId = toInstitutionId(user.institutionId);
  const { page, limit, skip, status } = parseListQuery(query);

  const where = { institutionId };
  if (status) where.status = status;
  if (user.role !== 'admin') where.createdBy = user.id;

  const [items, total] = await Promise.all([
    PdfImportJob.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PdfImportJob.countDocuments(where)
  ]);

  return {
    items: items.map(getPublicJob),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
};

const getPdfImportJobDetail = async ({ user, id }) => {
  if (!ensureObjectId(id)) throw new ApiError(400, 'ValidationError', ['id invalido']);
  const institutionId = toInstitutionId(user.institutionId);
  const job = await PdfImportJob.findById(id).lean();
  assertJobAccess({ job, user, institutionId });

  await logAudit({
    institutionId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.get`,
    entityType: 'PdfImportJob',
    entityId: job._id,
    metadata: {}
  });

  return getPublicJob(job);
};

const updatePdfImportPreview = async ({ user, id, payload }) => {
  if (!ensureObjectId(id)) throw new ApiError(400, 'ValidationError', ['id invalido']);
  const institutionId = toInstitutionId(user.institutionId);
  const job = await PdfImportJob.findById(id);
  assertJobAccess({ job, user, institutionId });

  if (job.status !== 'previewReady') {
    throw new ApiError(409, 'InvalidState', ['El job no esta en estado previewReady']);
  }

  const sanitizedQuestions = validatePreviewQuestions(payload.questions);
  job.preview.questions = sanitizedQuestions;
  await job.save();

  await logAudit({
    institutionId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.preview.update`,
    entityType: 'PdfImportJob',
    entityId: job._id,
    metadata: { editedQuestions: sanitizedQuestions.length }
  });

  return getPublicJob(job);
};

const confirmPdfImportJob = async ({ user, id, payload }) => {
  if (!ensureObjectId(id)) throw new ApiError(400, 'ValidationError', ['id invalido']);
  const institutionId = toInstitutionId(user.institutionId);
  const job = await PdfImportJob.findById(id);
  assertJobAccess({ job, user, institutionId });

  if (job.status !== 'previewReady') {
    throw new ApiError(409, 'InvalidState', ['El job no esta listo para confirmar']);
  }

  const { selectedQuestionNumbers } = parseConfirmPayload(payload);
  const selected = selectedQuestionNumbers.length
    ? (job.preview?.questions || []).filter((item) => selectedQuestionNumbers.includes(Number(item.qNumber)))
    : (job.preview?.questions || []);

  if (!selected.length) {
    throw new ApiError(400, 'ValidationError', ['No hay preguntas seleccionadas para importar']);
  }

  const operations = [];
  const skipped = [];
  selected.forEach((question) => {
    const mapped = mapPreviewQuestionToQuestionDoc(question, user, institutionId);
    if (!mapped.valid) {
      skipped.push({ qNumber: question.qNumber, reason: mapped.reason });
      return;
    }
    operations.push({ insertOne: { document: mapped.doc } });
  });

  if (!operations.length) {
    throw new ApiError(400, 'ValidationError', [
      'No hay preguntas validas para crear',
      ...skipped.map((item) => `Q${item.qNumber}: ${item.reason}`)
    ]);
  }

  const writeResult = await Question.bulkWrite(operations, { ordered: false });
  const insertedCount = Number(writeResult.insertedCount || 0);
  const insertedIds = Object.values(writeResult.insertedIds || {});
  const firstId = insertedIds[0] || null;

  job.status = 'confirmed';
  await job.save();

  await logAudit({
    institutionId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.confirm`,
    entityType: 'PdfImportJob',
    entityId: job._id,
    metadata: {
      createdCount: insertedCount,
      skippedCount: skipped.length,
      sample: firstId
    }
  });

  return {
    job: getPublicJob(job),
    createdIds: insertedIds,
    summary: {
      selected: selected.length,
      created: insertedCount,
      skipped
    }
  };
};

module.exports = {
  getPdfImportConfig: async ({ user }) => {
    const institutionId = toInstitutionId(user.institutionId);
    const config = await SystemConfig.findOne({ institutionId }).select('maxUploadMB').lean();
    const maxUploadMB = Number(config?.maxUploadMB);
    return {
      maxUploadMB: Number.isFinite(maxUploadMB) && maxUploadMB > 0 ? maxUploadMB : Number(process.env.MAX_UPLOAD_SIZE_MB || 25)
    };
  },
  createPdfImportJob,
  listPdfImportJobs,
  getPdfImportJobDetail,
  updatePdfImportPreview,
  confirmPdfImportJob
};
