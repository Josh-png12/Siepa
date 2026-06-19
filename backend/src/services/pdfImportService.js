const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');
const prisma = require('../config/prisma');
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

const safeFileName = (name) => String(name || 'source.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
const resolveJobDir = (jobId) => path.join(process.cwd(), 'uploads', 'pdf-import', String(jobId));

const getPublicJob = (job) => ({
  id: job.id,
  schoolId: job.schoolId,
  createdBy: job.createdById,
  status: job.status,
  pages: job.pages,
  isScanned: job.isScanned,
  ocrEngine: job.ocrEngine,
  source: {
    originalName: job.sourceOriginalName,
    mimeType: job.sourceMimeType,
    size: job.sourceSize
  },
  preview: (job.status === 'previewReady' || job.status === 'confirmed')
    ? { questions: job.previewQuestions, warnings: job.previewWarnings, stats: job.previewStats }
    : undefined,
  errors: job.errors || [],
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

const assertJobAccess = ({ job, user, schoolId }) => {
  if (!job) throw new ApiError(404, 'NotFound', ['PDF import job no encontrado']);
  if (job.schoolId !== schoolId) throw new ApiError(403, 'Forbidden', ['No autorizado para esta institucion']);
  if (user.role !== 'admin' && job.createdById !== user.id) {
    throw new ApiError(403, 'Forbidden', ['No autorizado para este job']);
  }
};

const buildJobError = (error) => ({
  type: error?.name || 'ProcessingError',
  message: error?.message || 'Unexpected PDF import error'
});

// Maps a previewQuestion entry to Prisma Question flat fields
const mapPreviewQuestionToQuestionData = (previewQuestion, user, schoolId) => {
  const options = (previewQuestion.options || [])
    .map((option) => ({
      label: String(option.label || '').trim().toUpperCase(),
      text: String(option.text || '').trim()
    }))
    .filter((option) => option.label && option.text);

  const correctAnswer = previewQuestion.detectedAnswer
    ? String(previewQuestion.detectedAnswer).trim().toUpperCase()
    : '';

  if (!String(previewQuestion.statement || '').trim()) return { valid: false, reason: 'MISSING_STATEMENT' };
  if (options.length < 4 || options.length > 5) return { valid: false, reason: 'INVALID_OPTIONS_COUNT' };
  if (!correctAnswer || !options.some((option) => option.label === correctAnswer)) {
    return { valid: false, reason: 'INVALID_OR_MISSING_ANSWER' };
  }

  return {
    valid: true,
    data: {
      schoolId,
      statementText: String(previewQuestion.statement || '').trim(),
      statementImages: [],
      latex: '',
      options,
      correctAnswer,
      area: String(previewQuestion.area || DEFAULT_QUESTION_VALUES.area).trim() || DEFAULT_QUESTION_VALUES.area,
      competencia: String(previewQuestion.competencia || DEFAULT_QUESTION_VALUES.competencia).trim() || DEFAULT_QUESTION_VALUES.competencia,
      nivelCognitivo: String(previewQuestion.nivelCognitivo || DEFAULT_QUESTION_VALUES.nivelCognitivo).trim() || DEFAULT_QUESTION_VALUES.nivelCognitivo,
      dificultadCualitativa: String(previewQuestion.dificultadCualitativa || DEFAULT_QUESTION_VALUES.dificultadCualitativa).trim() || DEFAULT_QUESTION_VALUES.dificultadCualitativa,
      triParamA: Number.isFinite(Number(previewQuestion?.tri?.a)) ? Number(previewQuestion.tri.a) : 1,
      triParamB: Number.isFinite(Number(previewQuestion?.tri?.b)) ? Number(previewQuestion.tri.b) : 0,
      triParamC: Number.isFinite(Number(previewQuestion?.tri?.c)) ? Number(previewQuestion.tri.c) : 0.2,
      visibility: 'private',
      calibrationStatus: 'experimental',
      estado: 'borrador',
      createdById: user.id,
      updatedById: user.id,
      currentVersion: 1
    }
  };
};

const getAuditPrefix = (user) => (user?.role === 'admin' ? 'admin' : 'teacher');

const processJob = async (jobId) => {
  const job = await prisma.pdfImportJob.findUnique({ where: { id: jobId } });
  if (!job) return null;
  if (!['uploaded', 'extracting', 'parsing'].includes(job.status)) return job;

  try {
    const outputDir = resolveJobDir(job.id);
    await fs.mkdir(outputDir, { recursive: true });

    await prisma.pdfImportJob.update({
      where: { id: jobId },
      data: { status: 'extracting', errors: [] }
    });

    const extracted = await pdfExtractService.extract({
      filePath: job.sourceFilePath,
      outputDir
    });

    const extractedTextPath = path.join(outputDir, 'extracted.txt');
    await fs.writeFile(extractedTextPath, extracted.text, 'utf8');

    await prisma.pdfImportJob.update({
      where: { id: jobId },
      data: {
        pages: Number(extracted.pages || 0),
        isScanned: Boolean(extracted.isScanned),
        ocrEngine: extracted.ocrEngine || null,
        extractedTextPath,
        status: 'parsing'
      }
    });

    const parsedJsonPath = path.join(outputDir, 'parsed.json');
    const preview = await pdfQuestionParserService.parseToPreview({
      extractedText: extracted.text,
      parsedJsonPath
    });

    await prisma.pdfImportJob.update({
      where: { id: jobId },
      data: {
        parsedJsonPath,
        previewQuestions: preview.questions || [],
        previewWarnings: preview.warnings || [],
        previewStats: preview.stats || {},
        status: 'previewReady'
      }
    });

    return prisma.pdfImportJob.findUnique({ where: { id: jobId } });
  } catch (error) {
    const currentJob = await prisma.pdfImportJob.findUnique({ where: { id: jobId }, select: { errors: true } });
    const existingErrors = Array.isArray(currentJob?.errors) ? currentJob.errors : [];
    await prisma.pdfImportJob.update({
      where: { id: jobId },
      data: { status: 'failed', errors: [...existingErrors, buildJobError(error)] }
    });
    return prisma.pdfImportJob.findUnique({ where: { id: jobId } });
  }
};

pdfImportQueueService.setProcessor(processJob);

const createPdfImportJob = async ({ user, file }) => {
  const schoolId = user.schoolId;
  const sourceName = safeFileName(file.originalname || 'source.pdf');

  const created = await prisma.pdfImportJob.create({
    data: {
      schoolId,
      createdById: user.id,
      status: 'uploaded',
      sourceOriginalName: sourceName,
      sourceMimeType: file.mimetype || 'application/pdf',
      sourceSize: Number(file.size || 0)
    }
  });

  const jobDir = resolveJobDir(created.id);
  await fs.mkdir(jobDir, { recursive: true });
  const sourcePath = path.join(jobDir, 'source.pdf');
  await fs.writeFile(sourcePath, file.buffer);

  await prisma.pdfImportJob.update({
    where: { id: created.id },
    data: { sourceFilePath: sourcePath }
  });

  await logAudit({
    schoolId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.create`,
    entityType: 'PdfImportJob',
    entityId: created.id,
    metadata: { size: created.sourceSize, mimeType: created.sourceMimeType }
  });

  pdfImportQueueService.enqueue(created.id).catch(() => {});

  return getPublicJob(await prisma.pdfImportJob.findUnique({ where: { id: created.id } }));
};

const listPdfImportJobs = async ({ user, query }) => {
  const schoolId = user.schoolId;
  const { page, limit, skip, status } = parseListQuery(query);

  const where = { schoolId };
  if (status) where.status = status;
  if (user.role !== 'admin') where.createdById = user.id;

  const [items, total] = await Promise.all([
    prisma.pdfImportJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.pdfImportJob.count({ where })
  ]);

  return {
    items: items.map(getPublicJob),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
};

const getPdfImportJobDetail = async ({ user, id }) => {
  const schoolId = user.schoolId;
  const job = await prisma.pdfImportJob.findUnique({ where: { id } });
  assertJobAccess({ job, user, schoolId });

  await logAudit({
    schoolId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.get`,
    entityType: 'PdfImportJob',
    entityId: id,
    metadata: {}
  });

  return getPublicJob(job);
};

const updatePdfImportPreview = async ({ user, id, payload }) => {
  const schoolId = user.schoolId;
  const job = await prisma.pdfImportJob.findUnique({ where: { id } });
  assertJobAccess({ job, user, schoolId });

  if (job.status !== 'previewReady') {
    throw new ApiError(409, 'InvalidState', ['El job no esta en estado previewReady']);
  }

  const sanitizedQuestions = validatePreviewQuestions(payload.questions);
  const updated = await prisma.pdfImportJob.update({
    where: { id },
    data: { previewQuestions: sanitizedQuestions }
  });

  await logAudit({
    schoolId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.preview.update`,
    entityType: 'PdfImportJob',
    entityId: id,
    metadata: { editedQuestions: sanitizedQuestions.length }
  });

  return getPublicJob(updated);
};

const confirmPdfImportJob = async ({ user, id, payload }) => {
  const schoolId = user.schoolId;
  const job = await prisma.pdfImportJob.findUnique({ where: { id } });
  assertJobAccess({ job, user, schoolId });

  if (job.status !== 'previewReady') {
    throw new ApiError(409, 'InvalidState', ['El job no esta listo para confirmar']);
  }

  const { selectedQuestionNumbers } = parseConfirmPayload(payload);
  const allQuestions = Array.isArray(job.previewQuestions) ? job.previewQuestions : [];
  const selected = selectedQuestionNumbers.length
    ? allQuestions.filter((item) => selectedQuestionNumbers.includes(Number(item.qNumber)))
    : allQuestions;

  if (!selected.length) {
    throw new ApiError(400, 'ValidationError', ['No hay preguntas seleccionadas para importar']);
  }

  const valid = [];
  const skipped = [];

  selected.forEach((question) => {
    const mapped = mapPreviewQuestionToQuestionData(question, user, schoolId);
    if (!mapped.valid) {
      skipped.push({ qNumber: question.qNumber, reason: mapped.reason });
    } else {
      valid.push(mapped.data);
    }
  });

  if (!valid.length) {
    throw new ApiError(400, 'ValidationError', [
      'No hay preguntas validas para crear',
      ...skipped.map((item) => `Q${item.qNumber}: ${item.reason}`)
    ]);
  }

  // Sequential creates replace bulkWrite — tolerate individual failures
  const createdIds = [];
  for (const data of valid) {
    try {
      const q = await prisma.question.create({ data });
      createdIds.push(q.id);
    } catch (_error) {
      // skip individual failures; final count reflects reality
    }
  }

  await prisma.pdfImportJob.update({ where: { id }, data: { status: 'confirmed' } });

  await logAudit({
    schoolId,
    userId: user.id,
    action: `${getAuditPrefix(user)}.pdf-import.confirm`,
    entityType: 'PdfImportJob',
    entityId: id,
    metadata: { createdCount: createdIds.length, skippedCount: skipped.length, sample: createdIds[0] || null }
  });

  const finalJob = await prisma.pdfImportJob.findUnique({ where: { id } });

  return {
    job: getPublicJob(finalJob),
    createdIds,
    summary: { selected: selected.length, created: createdIds.length, skipped }
  };
};

const getPdfImportConfig = async ({ user }) => {
  const config = await prisma.systemConfig.findUnique({
    where: { schoolId: user.schoolId },
    select: { maxUploadMB: true }
  });
  const maxUploadMB = Number(config?.maxUploadMB);
  return {
    maxUploadMB: Number.isFinite(maxUploadMB) && maxUploadMB > 0 ? maxUploadMB : Number(process.env.MAX_UPLOAD_SIZE_MB || 25)
  };
};

module.exports = {
  getPdfImportConfig,
  createPdfImportJob,
  listPdfImportJobs,
  getPdfImportJobDetail,
  updatePdfImportPreview,
  confirmPdfImportJob
};
