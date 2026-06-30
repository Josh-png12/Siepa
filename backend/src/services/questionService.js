const prisma = require('../config/prisma');

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const DIFF_VALUES = ['baja', 'media', 'alta'];
const VISIBILITY_VALUES = ['private', 'institutional', 'national'];
const CALIBRATION_VALUES = ['experimental', 'calibrated'];

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const parseNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeImages = (images = []) => {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => image && image.url)
    .map((image) => ({ url: String(image.url).trim(), caption: String(image.caption || '').trim() }));
};

const sanitizeOptions = (options = []) => {
  if (!Array.isArray(options)) return [];
  return options
    .filter((option) => option)
    .map((option) => ({
      label: String(option.label || '').trim().toUpperCase(),
      text: String(option.text || '').trim(),
      image: option.image?.url
        ? { url: String(option.image.url).trim(), caption: String(option.image.caption || '').trim() }
        : null
    }));
};

// Maps the incoming API payload to Prisma field names.
// statement.text → statementText, triParams.a → triParamA, etc.
const normalizeQuestionPayload = (payload = {}) => {
  const statement = payload.statement || {};
  return {
    statementText: String(statement.text || '').trim(),
    statementImages: sanitizeImages(statement.images),
    latex: String(payload.latex || '').trim(),
    options: sanitizeOptions(payload.options),
    correctAnswer: String(payload.correctAnswer || '').trim().toUpperCase(),
    area: String(payload.area || '').trim(),
    competencia: String(payload.competencia || '').trim(),
    nivelCognitivo: String(payload.nivelCognitivo || 'comprender').trim().toLowerCase(),
    dificultadCualitativa: String(payload.dificultadCualitativa || '').trim().toLowerCase(),
    triParamA: parseNumber(payload?.triParams?.a, 1),
    triParamB: parseNumber(payload?.triParams?.b, 0),
    triParamC: parseNumber(payload?.triParams?.c, 0.2),
    visibility: String(payload.visibility || 'private').trim().toLowerCase(),
    calibrationStatus: String(payload.calibrationStatus || 'experimental').trim().toLowerCase(),
    caseGroupId: payload.caseGroup || null
  };
};

const validateQuestionPayload = (payload, { partial = false } = {}) => {
  const normalized = normalizeQuestionPayload(payload);

  if (!partial || payload.statement !== undefined || payload.latex !== undefined) {
    if (!normalized.statementText && !normalized.latex) {
      throw buildError('Debe existir texto o latex en el enunciado', 400);
    }
  }

  if (!partial || payload.options !== undefined) {
    if (!Array.isArray(normalized.options) || normalized.options.length < 4 || normalized.options.length > 8) {
      throw buildError('La pregunta debe tener entre 4 y 8 opciones', 400);
    }
    const labels = normalized.options.map((o) => o.label);
    if (labels.some((label) => !OPTION_LABELS.includes(label))) {
      throw buildError('Las etiquetas de opciones deben estar entre A y H', 400);
    }
    if (new Set(labels).size !== labels.length) {
      throw buildError('No puede haber etiquetas de opcion duplicadas', 400);
    }
    if (normalized.options.some((o) => !o.text)) {
      throw buildError('Cada opcion debe tener texto', 400);
    }
  }

  if (!partial || payload.correctAnswer !== undefined || payload.options !== undefined) {
    if (!OPTION_LABELS.includes(normalized.correctAnswer)) {
      throw buildError('correctAnswer debe estar entre A y H', 400);
    }
    if (normalized.options.length && !normalized.options.find((o) => o.label === normalized.correctAnswer)) {
      throw buildError('correctAnswer debe existir dentro de las opciones', 400);
    }
  }

  if (!partial || payload.area !== undefined) {
    if (!normalized.area) throw buildError('area es requerida', 400);
  }

  if (!partial || payload.competencia !== undefined) {
    if (!normalized.competencia) throw buildError('competencia es requerida', 400);
  }

  if (!partial || payload.dificultadCualitativa !== undefined) {
    if (!DIFF_VALUES.includes(normalized.dificultadCualitativa)) {
      throw buildError('dificultadCualitativa debe ser baja, media o alta', 400);
    }
  }

  if (normalized.triParamA <= 0 || normalized.triParamA > 3) {
    throw buildError('triParams.a debe estar entre 0.01 y 3', 400);
  }
  if (normalized.triParamB < -3 || normalized.triParamB > 3) {
    throw buildError('triParams.b debe estar entre -3 y 3', 400);
  }
  if (normalized.triParamC < 0 || normalized.triParamC > 0.5) {
    throw buildError('triParams.c debe estar entre 0 y 0.5', 400);
  }

  if (!VISIBILITY_VALUES.includes(normalized.visibility)) {
    throw buildError('visibility invalida', 400);
  }
  if (!CALIBRATION_VALUES.includes(normalized.calibrationStatus)) {
    throw buildError('calibrationStatus invalido', 400);
  }

  return normalized;
};

const QUESTION_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  updatedBy: { select: { id: true, name: true, email: true, role: true } },
  caseGroup: true
};

// Snapshot for version history — mirrors field names in the DB
const buildQuestionSnapshot = (q) => ({
  statementText: q.statementText,
  statementImages: q.statementImages,
  latex: q.latex,
  options: q.options,
  correctAnswer: q.correctAnswer,
  area: q.area,
  competencia: q.competencia,
  nivelCognitivo: q.nivelCognitivo,
  dificultadCualitativa: q.dificultadCualitativa,
  triParamA: q.triParamA,
  triParamB: q.triParamB,
  triParamC: q.triParamC,
  visibility: q.visibility,
  calibrationStatus: q.calibrationStatus,
  estado: q.estado,
  caseGroupId: q.caseGroupId || null
});

const saveVersion = async (question, changedById, changeType, changeReason = '') => {
  await prisma.questionVersion.create({
    data: {
      questionId: question.id,
      versionNumber: question.currentVersion,
      snapshot: buildQuestionSnapshot(question),
      changeType,
      changeReason,
      changedById
    }
  });
};

const assertQuestionPermission = (question, user) => {
  if (user.role === 'admin') return;
  if (question.createdById !== user.id) {
    throw buildError('No tienes permisos para esta pregunta', 403);
  }
};

const sanitizeSort = (sortParam) => {
  const allowed = {
    updatedAt: true,
    createdAt: true,
    area: true,
    competencia: true,
    dificultadCualitativa: true,
    triParamB: true,
    calibrationStatus: true,
    visibility: true
  };

  if (!sortParam) return { updatedAt: 'desc' };

  const orderBy = {};
  String(sortParam)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((segment) => {
      const [field, dirRaw] = segment.split(':');
      if (!allowed[field]) return;
      orderBy[field] = String(dirRaw || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    });

  return Object.keys(orderBy).length ? orderBy : { updatedAt: 'desc' };
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

const createQuestion = async (payload, user) => {
  const normalized = validateQuestionPayload(payload);

  const question = await prisma.question.create({
    data: {
      ...normalized,
      schoolId: user.schoolId,
      estado: 'borrador',
      currentVersion: 1,
      createdById: user.id,
      updatedById: user.id
    },
    include: QUESTION_INCLUDE
  });

  await saveVersion(question, user.id, 'create');

  return question;
};

const listQuestions = async (query, user) => {
  const where = { schoolId: user.schoolId };

  if (query.area) where.area = query.area;
  if (query.competencia) where.competencia = query.competencia;
  if (query.dificultadCualitativa) where.dificultadCualitativa = query.dificultadCualitativa;
  if (query.calibrationStatus) where.calibrationStatus = query.calibrationStatus;
  if (query.visibility) where.visibility = query.visibility;
  if (query.estado) where.estado = query.estado;
  if (query.nivelCognitivo) where.nivelCognitivo = query.nivelCognitivo;
  if (query.creator) where.createdById = query.creator;

  const bMin = parseNumber(query.bMin, null);
  const bMax = parseNumber(query.bMax, null);
  if (bMin !== null || bMax !== null) {
    where.triParamB = {
      ...(bMin !== null ? { gte: bMin } : {}),
      ...(bMax !== null ? { lte: bMax } : {})
    };
  }

  if (user.role !== 'admin') {
    where.OR = [
      { createdById: user.id },
      { visibility: { in: ['institutional', 'national'] }, calibrationStatus: 'calibrated' }
    ];
  }

  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;
  const orderBy = sanitizeSort(query.sort);

  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      include: QUESTION_INCLUDE,
      orderBy,
      skip,
      take: limit
    })
  ]);

  return {
    items: questions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

const getQuestionById = async (id, user) => {
  const question = await prisma.question.findUnique({ where: { id }, include: QUESTION_INCLUDE });

  if (!question) throw buildError('Pregunta no encontrada', 404);

  const isOwner = question.createdById === user.id;
  const visibleForRole = ['institutional', 'national'].includes(question.visibility);
  if (user.role !== 'admin' && !isOwner && !visibleForRole) {
    throw buildError('No tienes permisos para ver esta pregunta', 403);
  }

  return question;
};

const updateQuestion = async (id, payload, user) => {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  const mergedPayload = {
    statement: {
      text: payload.statement?.text !== undefined ? payload.statement.text : question.statementText,
      images: payload.statement?.images !== undefined ? payload.statement.images : question.statementImages
    },
    latex: payload.latex !== undefined ? payload.latex : question.latex,
    options: payload.options !== undefined ? payload.options : question.options,
    correctAnswer: payload.correctAnswer !== undefined ? payload.correctAnswer : question.correctAnswer,
    area: payload.area !== undefined ? payload.area : question.area,
    competencia: payload.competencia !== undefined ? payload.competencia : question.competencia,
    nivelCognitivo: payload.nivelCognitivo !== undefined ? payload.nivelCognitivo : question.nivelCognitivo,
    dificultadCualitativa: payload.dificultadCualitativa !== undefined ? payload.dificultadCualitativa : question.dificultadCualitativa,
    triParams: {
      a: payload.triParams?.a !== undefined ? payload.triParams.a : question.triParamA,
      b: payload.triParams?.b !== undefined ? payload.triParams.b : question.triParamB,
      c: payload.triParams?.c !== undefined ? payload.triParams.c : question.triParamC
    },
    visibility: payload.visibility !== undefined ? payload.visibility : question.visibility,
    calibrationStatus: payload.calibrationStatus !== undefined ? payload.calibrationStatus : question.calibrationStatus,
    caseGroup: payload.caseGroup !== undefined ? payload.caseGroup : question.caseGroupId
  };

  const normalized = validateQuestionPayload(mergedPayload);
  const newVersion = question.currentVersion + 1;

  const updated = await prisma.question.update({
    where: { id },
    data: { ...normalized, updatedById: user.id, currentVersion: newVersion },
    include: QUESTION_INCLUDE
  });

  await saveVersion(updated, user.id, 'update', payload.changeReason || '');

  return updated;
};

const deleteQuestion = async (id, user) => {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  await prisma.$transaction([
    prisma.questionVersion.deleteMany({ where: { questionId: id } }),
    prisma.question.delete({ where: { id } })
  ]);
};

const publishQuestion = async (id, user) => {
  const question = await prisma.question.findUnique({ where: { id } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  const newVersion = question.currentVersion + 1;
  const updated = await prisma.question.update({
    where: { id },
    data: {
      estado: 'publicada',
      visibility: question.visibility === 'private' ? 'institutional' : question.visibility,
      updatedById: user.id,
      currentVersion: newVersion
    },
    include: QUESTION_INCLUDE
  });

  await saveVersion(updated, user.id, 'publish');

  return updated;
};

const getQuestionVersions = async (questionId, user) => {
  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  return prisma.questionVersion.findMany({
    where: { questionId },
    include: { changedBy: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { versionNumber: 'desc' }
  });
};

const restoreQuestionVersion = async ({ questionId, versionId, user }) => {
  const [question, version] = await Promise.all([
    prisma.question.findUnique({ where: { id: questionId } }),
    prisma.questionVersion.findFirst({ where: { id: versionId, questionId } })
  ]);

  if (!question) throw buildError('Pregunta no encontrada', 404);
  if (!version) throw buildError('Version no encontrada', 404);

  assertQuestionPermission(question, user);

  const snap = version.snapshot;
  const normalized = validateQuestionPayload({
    statement: { text: snap.statementText, images: snap.statementImages },
    latex: snap.latex,
    options: snap.options,
    correctAnswer: snap.correctAnswer,
    area: snap.area,
    competencia: snap.competencia,
    nivelCognitivo: snap.nivelCognitivo,
    dificultadCualitativa: snap.dificultadCualitativa,
    triParams: { a: snap.triParamA, b: snap.triParamB, c: snap.triParamC },
    visibility: snap.visibility,
    calibrationStatus: snap.calibrationStatus,
    caseGroup: snap.caseGroupId
  });

  const newVersion = question.currentVersion + 1;

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: { ...normalized, updatedById: user.id, currentVersion: newVersion },
    include: QUESTION_INCLUDE
  });

  await saveVersion(
    updated,
    user.id,
    'restore',
    `Restaurada desde version ${version.versionNumber}`
  );

  return updated;
};

module.exports = {
  buildError,
  createQuestion,
  listQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  publishQuestion,
  getQuestionVersions,
  restoreQuestionVersion,
  normalizeQuestionPayload,
  validateQuestionPayload
};
