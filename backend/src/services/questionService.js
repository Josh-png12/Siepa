const mongoose = require('mongoose');
const Question = require('../models/Question');
const QuestionVersion = require('../models/QuestionVersion');

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const DIFF_VALUES = ['baja', 'media', 'alta'];
const VISIBILITY_VALUES = ['private', 'institutional', 'national'];
const CALIBRATION_VALUES = ['experimental', 'calibrated'];

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const parseNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeImages = (images = []) => {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => image && image.url)
    .map((image) => ({
      url: String(image.url).trim(),
      caption: String(image.caption || '').trim()
    }));
};

const sanitizeOptions = (options = []) => {
  if (!Array.isArray(options)) return [];
  return options
    .filter((option) => option)
    .map((option) => ({
      label: String(option.label || '').trim().toUpperCase(),
      text: String(option.text || '').trim(),
      image: option.image?.url
        ? {
            url: String(option.image.url).trim(),
            caption: String(option.image.caption || '').trim()
          }
        : null
    }));
};

const normalizeQuestionPayload = (payload = {}) => {
  const statement = payload.statement || {};

  return {
    statement: {
      text: String(statement.text || '').trim(),
      images: sanitizeImages(statement.images)
    },
    latex: String(payload.latex || '').trim(),
    options: sanitizeOptions(payload.options),
    correctAnswer: String(payload.correctAnswer || '').trim().toUpperCase(),
    area: String(payload.area || '').trim(),
    competencia: String(payload.competencia || '').trim(),
    nivelCognitivo: String(payload.nivelCognitivo || 'comprender').trim().toLowerCase(),
    dificultadCualitativa: String(payload.dificultadCualitativa || '').trim().toLowerCase(),
    triParams: {
      a: parseNumber(payload?.triParams?.a, 1),
      b: parseNumber(payload?.triParams?.b, 0),
      c: parseNumber(payload?.triParams?.c, 0.2)
    },
    visibility: String(payload.visibility || 'private').trim().toLowerCase(),
    calibrationStatus: String(payload.calibrationStatus || 'experimental').trim().toLowerCase(),
    caseGroup: payload.caseGroup || null
  };
};

const validateQuestionPayload = (payload, { partial = false } = {}) => {
  const normalized = normalizeQuestionPayload(payload);

  if (!partial || payload.statement !== undefined || payload.latex !== undefined) {
    const hasText = Boolean(normalized.statement.text);
    const hasLatex = Boolean(normalized.latex);
    if (!hasText && !hasLatex) {
      throw buildError('Debe existir texto o latex en el enunciado', 400);
    }
  }

  if (!partial || payload.options !== undefined) {
    if (!Array.isArray(normalized.options) || normalized.options.length < 4 || normalized.options.length > 8) {
      throw buildError('La pregunta debe tener entre 4 y 8 opciones', 400);
    }

    const labels = normalized.options.map((option) => option.label);
    const uniqueLabels = new Set(labels);

    if (labels.some((label) => !OPTION_LABELS.includes(label))) {
      throw buildError('Las etiquetas de opciones deben estar entre A y H', 400);
    }

    if (uniqueLabels.size !== labels.length) {
      throw buildError('No puede haber etiquetas de opcion duplicadas', 400);
    }

    if (normalized.options.some((option) => !option.text)) {
      throw buildError('Cada opcion debe tener texto', 400);
    }
  }

  if (!partial || payload.correctAnswer !== undefined || payload.options !== undefined) {
    if (!OPTION_LABELS.includes(normalized.correctAnswer)) {
      throw buildError('correctAnswer debe estar entre A y H', 400);
    }
    if (normalized.options.length && !normalized.options.find((option) => option.label === normalized.correctAnswer)) {
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

  if (normalized.triParams.a <= 0 || normalized.triParams.a > 3) {
    throw buildError('triParams.a debe estar entre 0.01 y 3', 400);
  }
  if (normalized.triParams.b < -3 || normalized.triParams.b > 3) {
    throw buildError('triParams.b debe estar entre -3 y 3', 400);
  }
  if (normalized.triParams.c < 0 || normalized.triParams.c > 0.5) {
    throw buildError('triParams.c debe estar entre 0 y 0.5', 400);
  }

  if (!VISIBILITY_VALUES.includes(normalized.visibility)) {
    throw buildError('visibility invalida', 400);
  }

  if (!CALIBRATION_VALUES.includes(normalized.calibrationStatus)) {
    throw buildError('calibrationStatus invalido', 400);
  }

  if (normalized.caseGroup && !isObjectId(normalized.caseGroup)) {
    throw buildError('caseGroup invalido', 400);
  }

  return normalized;
};

const buildQuestionSnapshot = (question) => ({
  statement: question.statement,
  latex: question.latex,
  options: question.options,
  correctAnswer: question.correctAnswer,
  area: question.area,
  competencia: question.competencia,
  nivelCognitivo: question.nivelCognitivo,
  dificultadCualitativa: question.dificultadCualitativa,
  triParams: question.triParams,
  visibility: question.visibility,
  calibrationStatus: question.calibrationStatus,
  stats: question.stats,
  estado: question.estado,
  caseGroup: question.caseGroup || null
});

const saveVersion = async ({ question, changedBy, changeType, changeReason = '' }) => {
  await QuestionVersion.create({
    question: question._id,
    versionNumber: question.currentVersion,
    snapshot: buildQuestionSnapshot(question),
    changeType,
    changeReason,
    changedBy
  });
};

const assertQuestionPermission = (question, user) => {
  const isAdmin = user.role === 'admin';
  const isOwner = question.metadata?.createdBy?.toString() === String(user.id);

  if (!isAdmin && !isOwner) {
    throw buildError('No tienes permisos para esta pregunta', 403);
  }
};

const sanitizeSort = (sortParam) => {
  if (!sortParam) {
    return { updatedAt: -1 };
  }

  const allowed = new Set([
    'updatedAt',
    'createdAt',
    'area',
    'competencia',
    'dificultadCualitativa',
    'triParams.b',
    'calibrationStatus',
    'visibility'
  ]);

  const segments = String(sortParam)
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const sort = {};
  segments.forEach((segment) => {
    const [field, dirRaw] = segment.split(':');
    if (!allowed.has(field)) return;
    const dir = String(dirRaw || 'desc').toLowerCase();
    sort[field] = dir === 'asc' ? 1 : -1;
  });

  return Object.keys(sort).length ? sort : { updatedAt: -1 };
};

const createQuestion = async (payload, user) => {
  const normalized = validateQuestionPayload(payload);

  const question = await Question.create({
    ...normalized,
    metadata: {
      createdBy: user.id,
      updatedBy: user.id
    },
    estado: 'borrador',
    currentVersion: 1
  });

  await saveVersion({ question, changedBy: user.id, changeType: 'create' });

  return Question.findById(question._id)
    .populate('metadata.createdBy', 'name email role')
    .populate('metadata.updatedBy', 'name email role')
    .lean();
};

const listQuestions = async (query, user) => {
  const filters = [];

  if (query.area) filters.push({ area: query.area });
  if (query.competencia) filters.push({ competencia: query.competencia });
  if (query.dificultadCualitativa) filters.push({ dificultadCualitativa: query.dificultadCualitativa });
  if (query.calibrationStatus) filters.push({ calibrationStatus: query.calibrationStatus });
  if (query.visibility) filters.push({ visibility: query.visibility });
  if (query.estado) filters.push({ estado: query.estado });
  if (query.nivelCognitivo) filters.push({ nivelCognitivo: query.nivelCognitivo });

  if (query.creator) {
    if (!isObjectId(query.creator)) throw buildError('creator invalido', 400);
    filters.push({ 'metadata.createdBy': query.creator });
  }

  const bMin = parseNumber(query.bMin, null);
  const bMax = parseNumber(query.bMax, null);
  if (bMin !== null || bMax !== null) {
    filters.push({
      'triParams.b': {
        ...(bMin !== null ? { $gte: bMin } : {}),
        ...(bMax !== null ? { $lte: bMax } : {})
      }
    });
  }

  if (user.role !== 'admin') {
    filters.push({
      $or: [
        { 'metadata.createdBy': user.id },
        { visibility: { $in: ['institutional', 'national'] } }
      ]
    });
  }

  const where = filters.length ? { $and: filters } : {};
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;
  const sort = sanitizeSort(query.sort);

  const [total, questions] = await Promise.all([
    Question.countDocuments(where),
    Question.find(where)
      .populate('metadata.createdBy', 'name email role')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  return {
    items: questions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getQuestionById = async (id, user) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const question = await Question.findById(id)
    .populate('metadata.createdBy', 'name email role')
    .populate('metadata.updatedBy', 'name email role')
    .populate('caseGroup')
    .lean();

  if (!question) throw buildError('Pregunta no encontrada', 404);

  const isOwner = question.metadata?.createdBy?._id?.toString() === String(user.id);
  const visibleForRole = ['institutional', 'national'].includes(question.visibility);
  if (user.role !== 'admin' && !isOwner && !visibleForRole) {
    throw buildError('No tienes permisos para ver esta pregunta', 403);
  }

  return question;
};

const updateQuestion = async (id, payload, user) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const question = await Question.findById(id);
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  const mergedPayload = {
    statement: payload.statement !== undefined ? payload.statement : question.statement,
    latex: payload.latex !== undefined ? payload.latex : question.latex,
    options: payload.options !== undefined ? payload.options : question.options,
    correctAnswer: payload.correctAnswer !== undefined ? payload.correctAnswer : question.correctAnswer,
    area: payload.area !== undefined ? payload.area : question.area,
    competencia: payload.competencia !== undefined ? payload.competencia : question.competencia,
    nivelCognitivo: payload.nivelCognitivo !== undefined ? payload.nivelCognitivo : question.nivelCognitivo,
    dificultadCualitativa: payload.dificultadCualitativa !== undefined ? payload.dificultadCualitativa : question.dificultadCualitativa,
    triParams: payload.triParams !== undefined ? payload.triParams : question.triParams,
    visibility: payload.visibility !== undefined ? payload.visibility : question.visibility,
    calibrationStatus: payload.calibrationStatus !== undefined ? payload.calibrationStatus : question.calibrationStatus,
    caseGroup: payload.caseGroup !== undefined ? payload.caseGroup : question.caseGroup
  };

  const normalized = validateQuestionPayload(mergedPayload);

  Object.assign(question, normalized);
  question.metadata.updatedBy = user.id;
  question.currentVersion += 1;

  await question.save();
  await saveVersion({ question, changedBy: user.id, changeType: 'update', changeReason: payload.changeReason || '' });

  return Question.findById(question._id)
    .populate('metadata.createdBy', 'name email role')
    .populate('metadata.updatedBy', 'name email role')
    .lean();
};

const deleteQuestion = async (id, user) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const question = await Question.findById(id);
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  await Promise.all([
    QuestionVersion.deleteMany({ question: question._id }),
    Question.findByIdAndDelete(question._id)
  ]);
};

const publishQuestion = async (id, user) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const question = await Question.findById(id);
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  question.estado = 'publicada';
  if (question.visibility === 'private') {
    question.visibility = 'institutional';
  }
  question.metadata.updatedBy = user.id;
  question.currentVersion += 1;

  await question.save();
  await saveVersion({ question, changedBy: user.id, changeType: 'publish' });

  return Question.findById(question._id)
    .populate('metadata.createdBy', 'name email role')
    .populate('metadata.updatedBy', 'name email role')
    .lean();
};

const getQuestionVersions = async (questionId, user) => {
  if (!isObjectId(questionId)) throw buildError('id invalido', 400);

  const question = await Question.findById(questionId);
  if (!question) throw buildError('Pregunta no encontrada', 404);

  assertQuestionPermission(question, user);

  return QuestionVersion.find({ question: questionId })
    .populate('changedBy', 'name email role')
    .sort({ versionNumber: -1 })
    .lean();
};

const restoreQuestionVersion = async ({ questionId, versionId, user }) => {
  if (!isObjectId(questionId) || !isObjectId(versionId)) throw buildError('id invalido', 400);

  const [question, version] = await Promise.all([
    Question.findById(questionId),
    QuestionVersion.findOne({ _id: versionId, question: questionId })
  ]);

  if (!question) throw buildError('Pregunta no encontrada', 404);
  if (!version) throw buildError('Version no encontrada', 404);

  assertQuestionPermission(question, user);

  const normalized = validateQuestionPayload(version.snapshot);

  Object.assign(question, normalized);
  question.metadata.updatedBy = user.id;
  question.currentVersion += 1;

  await question.save();
  await saveVersion({
    question,
    changedBy: user.id,
    changeType: 'restore',
    changeReason: `Restaurada desde version ${version.versionNumber}`
  });

  return Question.findById(question._id)
    .populate('metadata.createdBy', 'name email role')
    .populate('metadata.updatedBy', 'name email role')
    .lean();
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
