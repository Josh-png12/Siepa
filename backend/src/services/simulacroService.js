const mongoose = require('mongoose');
const Simulacro = require('../models/Simulacro');
const SimulacroResult = require('../models/SimulacroResult');
const Question = require('../models/Question');
const { normalizeQuestionPayload, validateQuestionPayload } = require('./questionService');

const MODULE_NAMES = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const parsePositiveInt = (value, fieldName, min = 1, max = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw buildError(`${fieldName} debe ser entero entre ${min} y ${max}`, 400);
  }
  return parsed;
};

const parseOptionalLimit = (value, fieldName, min, max) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw buildError(`${fieldName} debe estar entre ${min} y ${max}`, 400);
  }
  return parsed;
};

const assertTeacherOwnsSimulacro = (simulacro, teacherId) => {
  if (String(simulacro.createdBy) !== String(teacherId)) {
    throw buildError('No tienes permisos sobre este simulacro', 403);
  }
};

const sanitizeManualModuleQuestions = async ({ questionsInput = [], teacherId, moduleName }) => {
  if (!Array.isArray(questionsInput) || questionsInput.length < 1) {
    throw buildError(`El modulo ${moduleName} requiere al menos una pregunta`, 400);
  }

  const processed = [];
  const refIds = [];

  questionsInput.forEach((item, index) => {
    const order = Number(item.order || index + 1);
    if (!Number.isFinite(order) || order < 1) {
      throw buildError(`Cada pregunta del modulo ${moduleName} requiere order valido`, 400);
    }

    if (item.question && isObjectId(item.question)) {
      refIds.push(String(item.question));
      processed.push({ question: String(item.question), embeddedQuestion: null, order });
      return;
    }

    if (item.embeddedQuestion) {
      const normalized = normalizeQuestionPayload(item.embeddedQuestion);
      validateQuestionPayload(normalized);
      processed.push({ question: null, embeddedQuestion: normalized, order });
      return;
    }

    throw buildError(`Cada item del modulo ${moduleName} debe incluir question o embeddedQuestion`, 400);
  });

  if (refIds.length) {
    const uniqueIds = [...new Set(refIds)];
    const questions = await Question.find({ _id: { $in: uniqueIds } })
      .select('_id metadata visibility estado')
      .lean();

    if (questions.length !== uniqueIds.length) {
      throw buildError(`Una o mas preguntas del modulo ${moduleName} no existen`, 404);
    }

    questions.forEach((question) => {
      const isOwner = String(question.metadata?.createdBy) === String(teacherId);
      const isShared = ['institutional', 'national'].includes(question.visibility);
      const isPublished = question.estado === 'publicada';
      if (!isOwner && !(isShared && isPublished)) {
        throw buildError(`No tienes acceso a una pregunta del modulo ${moduleName}`, 403);
      }
    });
  }

  return processed;
};

const buildAutoModuleQuestions = async ({ moduleConfig }) => {
  const totalQuestions = parsePositiveInt(moduleConfig.totalQuestions, `totalQuestions (${moduleConfig.name})`, 1, 120);
  const targetTheta = Number(moduleConfig.targetTheta);
  if (!Number.isFinite(targetTheta)) {
    throw buildError(`targetTheta (${moduleConfig.name}) debe ser numerico`, 400);
  }

  const match = { estado: 'publicada' };
  if (moduleConfig.area) match.area = String(moduleConfig.area).trim();
  if (moduleConfig.competencia) match.competencia = String(moduleConfig.competencia).trim();

  const selected = await Question.aggregate([
    { $match: match },
    {
      $addFields: {
        thetaDistance: { $abs: { $subtract: ['$triParams.b', targetTheta] } }
      }
    },
    { $sort: { thetaDistance: 1, _id: 1 } },
    { $limit: totalQuestions },
    { $project: { _id: 1 } }
  ]);

  if (selected.length < totalQuestions) {
    throw buildError(`No hay suficientes preguntas para el modulo ${moduleConfig.name}`, 400);
  }

  return selected.map((item, index) => ({
    question: item._id,
    embeddedQuestion: null,
    order: index + 1
  }));
};

const normalizeModuleName = (name) => {
  const value = String(name || '').trim();
  if (!MODULE_NAMES.includes(value)) {
    throw buildError(`Modulo invalido: ${value || 'vacio'}. Usa: ${MODULE_NAMES.join(', ')}`, 400);
  }
  return value;
};

const buildManualModules = async ({ modulesInput, teacherId }) => {
  if (!Array.isArray(modulesInput) || modulesInput.length < 1) {
    throw buildError('Debes enviar al menos un modulo', 400);
  }

  const names = new Set();
  const modules = [];

  for (const moduleItem of modulesInput) {
    const name = normalizeModuleName(moduleItem.name);
    if (names.has(name)) throw buildError(`Modulo repetido: ${name}`, 400);
    names.add(name);

    const timeLimit = parseOptionalLimit(moduleItem.timeLimit, `timeLimit (${name})`, 5, 180);
    const questions = await sanitizeManualModuleQuestions({
      questionsInput: moduleItem.questions,
      teacherId,
      moduleName: name
    });

    modules.push({
      name,
      questions,
      timeLimit
    });
  }

  return modules;
};

const buildAutoModules = async ({ modulesInput }) => {
  if (!Array.isArray(modulesInput) || modulesInput.length < 1) {
    throw buildError('Debes enviar al menos un modulo para generacion inteligente', 400);
  }

  const names = new Set();
  const modules = [];

  for (const moduleItem of modulesInput) {
    const name = normalizeModuleName(moduleItem.name);
    if (names.has(name)) throw buildError(`Modulo repetido: ${name}`, 400);
    names.add(name);

    const questions = await buildAutoModuleQuestions({ moduleConfig: moduleItem });
    const timeLimit = parseOptionalLimit(moduleItem.timeLimit, `timeLimit (${name})`, 5, 180);

    modules.push({
      name,
      questions,
      timeLimit
    });
  }

  return modules;
};

const mapSimulacroDoc = (simulacro) =>
  Simulacro.findById(simulacro._id)
    .populate('createdBy', 'name email role')
    .populate('updatedBy', 'name email role')
    .populate('modules.questions.question', 'statement latex options correctAnswer area competencia dificultadCualitativa triParams')
    .lean();

const createManualSimulacro = async (payload, teacherId) => {
  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const modules = await buildManualModules({ modulesInput: payload.modules, teacherId });
  const globalTimeLimit = parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 30, 360);

  const simulacro = await Simulacro.create({
    title,
    description: String(payload.description || '').trim(),
    modules,
    globalTimeLimit,
    strictMode: Boolean(payload.strictMode),
    estado: 'borrador',
    createdBy: teacherId,
    updatedBy: teacherId
  });

  return mapSimulacroDoc(simulacro);
};

const createSmartSimulacro = async (payload, teacherId) => {
  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const modules = await buildAutoModules({ modulesInput: payload.modules });
  const globalTimeLimit = parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 30, 360);

  const simulacro = await Simulacro.create({
    title,
    description: String(payload.description || '').trim(),
    modules,
    globalTimeLimit,
    strictMode: Boolean(payload.strictMode),
    estado: 'borrador',
    createdBy: teacherId,
    updatedBy: teacherId
  });

  return mapSimulacroDoc(simulacro);
};

const getSimulacrosByTeacher = async (query, teacherId) => {
  const where = { createdBy: teacherId };
  if (query.estado) where.estado = query.estado;

  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    Simulacro.countDocuments(where),
    Simulacro.find(where)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getSimulacroById = async (id, userId, role = 'docente') => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(id)
    .populate('createdBy', 'name email role')
    .populate('updatedBy', 'name email role')
    .populate('modules.questions.question', 'statement latex options correctAnswer area competencia dificultadCualitativa triParams')
    .lean();

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  if (role === 'docente') {
    assertTeacherOwnsSimulacro(simulacro, userId);
  } else if (role === 'estudiante') {
    if (simulacro.estado !== 'publicado') {
      throw buildError('Simulacro no disponible', 403);
    }
  }

  return simulacro;
};

const updateSimulacro = async (id, payload, teacherId) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(id);
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, teacherId);

  if (simulacro.estado !== 'borrador') {
    throw buildError('Solo puedes editar simulacros en borrador', 400);
  }

  if (payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) throw buildError('title no puede estar vacio', 400);
    simulacro.title = title;
  }

  if (payload.description !== undefined) {
    simulacro.description = String(payload.description || '').trim();
  }

  if (payload.strictMode !== undefined) {
    simulacro.strictMode = Boolean(payload.strictMode);
  }

  if (payload.globalTimeLimit !== undefined) {
    simulacro.globalTimeLimit = parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 30, 360);
  }

  if (payload.modules !== undefined) {
    simulacro.modules = await buildManualModules({ modulesInput: payload.modules, teacherId });
  }

  simulacro.updatedBy = teacherId;
  await simulacro.save();

  return mapSimulacroDoc(simulacro);
};

const publishSimulacro = async (id, teacherId) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(id);
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, teacherId);

  const totalQuestions = (simulacro.modules || []).reduce(
    (acc, moduleItem) => acc + (moduleItem.questions?.length || 0),
    0
  );

  if (totalQuestions < 1) {
    throw buildError('No puedes publicar un simulacro sin preguntas', 400);
  }

  simulacro.estado = 'publicado';
  simulacro.fechaPublicacion = new Date();
  simulacro.updatedBy = teacherId;

  await simulacro.save();

  return mapSimulacroDoc(simulacro);
};

const deleteSimulacro = async (id, teacherId) => {
  if (!isObjectId(id)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(id);
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, teacherId);

  await Promise.all([
    SimulacroResult.deleteMany({ simulacroId: simulacro._id }),
    Simulacro.findByIdAndDelete(simulacro._id)
  ]);
};

const getAvailableSimulacrosForStudent = async (query) => {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;

  const where = { estado: 'publicado' };

  const [total, items] = await Promise.all([
    Simulacro.countDocuments(where),
    Simulacro.find(where)
      .select('title description modules globalTimeLimit strictMode estado fechaPublicacion createdBy createdAt')
      .sort({ fechaPublicacion: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const flattenModuleQuestions = (simulacro) => {
  const flat = [];
  (simulacro.modules || []).forEach((moduleItem) => {
    (moduleItem.questions || []).forEach((moduleQuestion) => {
      if (moduleQuestion.question) {
        flat.push({
          questionId: String(moduleQuestion.question),
          moduleName: moduleItem.name
        });
      }
    });
  });
  return flat;
};

const startSimulacro = async (simulacroId, studentId) => {
  if (!isObjectId(simulacroId)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(simulacroId)
    .populate('modules.questions.question', 'statement latex options area competencia dificultadCualitativa triParams')
    .lean();

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);
  if (simulacro.estado !== 'publicado') throw buildError('Simulacro no disponible', 403);

  const previous = await SimulacroResult.findOne({
    simulacroId,
    studentId,
    status: 'in_progress'
  })
    .sort({ createdAt: -1 })
    .lean();

  if (previous) {
    return {
      attemptId: previous._id,
      resumed: true,
      simulacro
    };
  }

  const moduleTimes = (simulacro.modules || []).map((moduleItem) => ({
    moduleName: moduleItem.name,
    secondsSpent: 0
  }));

  const attempt = await SimulacroResult.create({
    simulacroId,
    studentId,
    answers: [],
    markedForReview: [],
    moduleTimes,
    status: 'in_progress',
    startTime: new Date()
  });

  return {
    attemptId: attempt._id,
    resumed: false,
    simulacro
  };
};

const erfApprox = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
};

const toPercentile = (theta) => {
  const z = Number(theta) / Math.sqrt(2);
  const cdf = 0.5 * (1 + erfApprox(z));
  return Math.max(1, Math.min(99, Math.round(cdf * 100)));
};

const scoreTheta = (answers, questionsMap) => {
  if (!answers.length) return 0;

  let weighted = 0;
  let totalWeight = 0;

  answers.forEach((answer) => {
    const question = questionsMap.get(String(answer.questionId));
    if (!question) return;

    const isCorrect = String(answer.selectedOption) === String(question.correctAnswer);
    const a = Number(question.triParams?.a ?? 1);
    const b = Number(question.triParams?.b ?? 0);
    const sign = isCorrect ? 1 : -1;

    weighted += sign * a * Math.max(0.3, 1 - Math.abs(b) / 3);
    totalWeight += Math.max(a, 0.1);
  });

  if (totalWeight === 0) return 0;

  const raw = (weighted / totalWeight) * 3;
  return Math.max(-3, Math.min(3, Number(raw.toFixed(4))));
};

const submitSimulacro = async ({ simulacroId, studentId, answersInput, moduleTimesInput, markedForReviewInput }) => {
  if (!isObjectId(simulacroId)) throw buildError('id invalido', 400);

  const simulacro = await Simulacro.findById(simulacroId)
    .populate('modules.questions.question', 'correctAnswer triParams area competencia')
    .lean();

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);
  if (simulacro.estado !== 'publicado') throw buildError('Simulacro no disponible', 403);

  const attempt = await SimulacroResult.findOne({
    simulacroId,
    studentId,
    status: 'in_progress'
  }).sort({ createdAt: -1 });

  if (!attempt) {
    throw buildError('No hay un intento activo para este simulacro', 400);
  }

  const flatQuestions = flattenModuleQuestions(simulacro);
  const validQuestionIds = new Set(flatQuestions.map((item) => item.questionId));
  const questionModuleMap = new Map(flatQuestions.map((item) => [item.questionId, item.moduleName]));

  const allQuestionDocs = [];
  (simulacro.modules || []).forEach((moduleItem) => {
    (moduleItem.questions || []).forEach((q) => {
      if (q.question) allQuestionDocs.push(q.question);
    });
  });
  const questionsMap = new Map(allQuestionDocs.map((q) => [String(q._id), q]));

  const normalizedAnswers = [];
  const answersArray = Array.isArray(answersInput) ? answersInput : [];

  for (const item of answersArray) {
    const questionId = String(item.questionId || '');
    const selectedOption = String(item.selectedOption || '').toUpperCase();

    if (!isObjectId(questionId) || !validQuestionIds.has(questionId)) {
      throw buildError('Una respuesta contiene questionId invalido para este simulacro', 400);
    }

    if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(selectedOption)) {
      throw buildError('selectedOption invalida', 400);
    }

    const question = questionsMap.get(questionId);
    normalizedAnswers.push({
      questionId,
      selectedOption,
      isCorrect: selectedOption === String(question.correctAnswer)
    });
  }

  const dedupMap = new Map();
  normalizedAnswers.forEach((answer) => {
    dedupMap.set(String(answer.questionId), answer);
  });
  const dedupedAnswers = Array.from(dedupMap.values());

  const moduleNames = (simulacro.modules || []).map((moduleItem) => moduleItem.name);
  const moduleTimes = moduleNames.map((name) => {
    const source = Array.isArray(moduleTimesInput)
      ? moduleTimesInput.find((item) => item && item.moduleName === name)
      : null;
    return {
      moduleName: name,
      secondsSpent: Math.max(0, Number(source?.secondsSpent || 0))
    };
  });

  const thetasByModule = moduleNames.map((name) => {
    const answersForModule = dedupedAnswers.filter(
      (answer) => questionModuleMap.get(String(answer.questionId)) === name
    );

    return {
      moduleName: name,
      theta: scoreTheta(answersForModule, questionsMap)
    };
  });

  const overallTheta = thetasByModule.length
    ? Number(
        (
          thetasByModule.reduce((sum, item) => sum + Number(item.theta || 0), 0) /
          thetasByModule.length
        ).toFixed(4)
      )
    : 0;

  const percentile = toPercentile(overallTheta);

  const markIds = Array.isArray(markedForReviewInput)
    ? markedForReviewInput.filter((id) => isObjectId(id)).map((id) => new mongoose.Types.ObjectId(String(id)))
    : [];

  attempt.answers = dedupedAnswers;
  attempt.markedForReview = markIds;
  attempt.moduleTimes = moduleTimes;
  attempt.thetasByModule = thetasByModule;
  attempt.overallTheta = overallTheta;
  attempt.percentile = percentile;
  attempt.endTime = new Date();
  attempt.status = 'submitted';

  await attempt.save();

  return SimulacroResult.findById(attempt._id)
    .populate('simulacroId', 'title modules globalTimeLimit strictMode')
    .lean();
};

const getStudentResultsForSimulacro = async (simulacroId, studentId) => {
  if (!isObjectId(simulacroId)) throw buildError('id invalido', 400);

  const result = await SimulacroResult.findOne({
    simulacroId,
    studentId,
    status: 'submitted'
  })
    .sort({ createdAt: -1 })
    .populate('simulacroId', 'title modules globalTimeLimit strictMode')
    .lean();

  if (!result) {
    throw buildError('No hay resultados para este simulacro', 404);
  }

  return result;
};

module.exports = {
  buildError,
  createManualSimulacro,
  createSmartSimulacro,
  getSimulacrosByTeacher,
  getSimulacroById,
  updateSimulacro,
  publishSimulacro,
  deleteSimulacro,
  getAvailableSimulacrosForStudent,
  startSimulacro,
  submitSimulacro,
  getStudentResultsForSimulacro
};
