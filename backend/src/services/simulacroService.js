const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { normalizeQuestionPayload, validateQuestionPayload } = require('./questionService');

const MODULE_NAMES = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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
  if (simulacro.createdById !== teacherId) {
    throw buildError('No tienes permisos sobre este simulacro', 403);
  }
};

// ── FULL SIMULACRO INCLUDE ────────────────────────────────────────────────────
const SIMULACRO_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  updatedBy: { select: { id: true, name: true, email: true, role: true } },
  modules: {
    orderBy: { order: 'asc' },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          question: {
            select: {
              id: true,
              statementText: true,
              statementImages: true,
              latex: true,
              options: true,
              correctAnswer: true,
              area: true,
              competencia: true,
              dificultadCualitativa: true,
              triParamA: true,
              triParamB: true,
              triParamC: true,
              caseGroupId: true,
              caseGroup: {
                select: {
                  id: true,
                  title: true,
                  contextText: true,
                  contextLatex: true,
                  contextImages: true,
                  source: true
                }
              }
            }
          }
        }
      }
    }
  }
};

// ── MODULE BUILDING HELPERS ───────────────────────────────────────────────────

const sanitizeManualModuleQuestions = async ({ questionsInput = [], teacherId, moduleName, schoolId }) => {
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

    if (item.question) {
      refIds.push(String(item.question));
      processed.push({ questionId: String(item.question), embeddedQuestion: null, order });
      return;
    }

    if (item.embeddedQuestion) {
      const normalized = normalizeQuestionPayload(item.embeddedQuestion);
      validateQuestionPayload(normalized);
      processed.push({ questionId: null, embeddedQuestion: normalized, order });
      return;
    }

    throw buildError(`Cada item del modulo ${moduleName} debe incluir question o embeddedQuestion`, 400);
  });

  if (refIds.length) {
    const uniqueIds = [...new Set(refIds)];
    const questions = await prisma.question.findMany({
      where: { id: { in: uniqueIds }, schoolId },
      select: { id: true, createdById: true, visibility: true, estado: true }
    });

    if (questions.length !== uniqueIds.length) {
      throw buildError(`Una o mas preguntas del modulo ${moduleName} no existen`, 404);
    }

    questions.forEach((q) => {
      const isOwner = q.createdById === teacherId;
      const isShared = ['institutional', 'national'].includes(q.visibility);
      const isPublished = q.estado === 'publicada';
      if (!isOwner && !(isShared && isPublished)) {
        throw buildError(`No tienes acceso a una pregunta del modulo ${moduleName}`, 403);
      }
    });
  }

  return processed;
};

// Uses raw SQL to order by ABS(triParamB - targetTheta) — not supported in Prisma ORM
// schoolId filter prevents mixing questions across tenants (multi-tenant fix)
const buildAutoModuleQuestions = async ({ moduleConfig, schoolId }) => {
  const totalQuestions = parsePositiveInt(
    moduleConfig.totalQuestions,
    `totalQuestions (${moduleConfig.name})`,
    1,
    120
  );
  const targetTheta = Number(moduleConfig.targetTheta);
  if (!Number.isFinite(targetTheta)) {
    throw buildError(`targetTheta (${moduleConfig.name}) debe ser numerico`, 400);
  }

  const conditions = [
    Prisma.sql`"schoolId" = ${schoolId}`,
    Prisma.sql`estado = 'publicada'`
  ];
  if (moduleConfig.area) conditions.push(Prisma.sql`area = ${String(moduleConfig.area).trim()}`);
  if (moduleConfig.competencia) conditions.push(Prisma.sql`competencia = ${String(moduleConfig.competencia).trim()}`);

  const whereClause = Prisma.join(conditions, ' AND ');

  const selected = await prisma.$queryRaw`
    SELECT id
    FROM "Question"
    WHERE ${whereClause}
    ORDER BY ABS("triParamB" - ${targetTheta}) ASC, id ASC
    LIMIT ${totalQuestions}
  `;

  if (selected.length < totalQuestions) {
    throw buildError(`No hay suficientes preguntas para el modulo ${moduleConfig.name}`, 400);
  }

  return selected.map((row, index) => ({
    questionId: row.id,
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

const buildManualModules = async ({ modulesInput, teacherId, schoolId }) => {
  if (!Array.isArray(modulesInput) || modulesInput.length < 1) {
    throw buildError('Debes enviar al menos un modulo', 400);
  }

  const names = new Set();
  const modules = [];

  for (const item of modulesInput) {
    const name = normalizeModuleName(item.name);
    if (names.has(name)) throw buildError(`Modulo repetido: ${name}`, 400);
    names.add(name);

    const timeLimit = parseOptionalLimit(item.timeLimit, `timeLimit (${name})`, 5, 180);
    const questions = await sanitizeManualModuleQuestions({
      questionsInput: item.questions,
      teacherId,
      moduleName: name,
      schoolId
    });

    modules.push({ name, questions, timeLimit });
  }

  return modules;
};

const buildAutoModules = async ({ modulesInput, schoolId }) => {
  if (!Array.isArray(modulesInput) || modulesInput.length < 1) {
    throw buildError('Debes enviar al menos un modulo para generacion inteligente', 400);
  }

  const names = new Set();
  const modules = [];

  for (const item of modulesInput) {
    const name = normalizeModuleName(item.name);
    if (names.has(name)) throw buildError(`Modulo repetido: ${name}`, 400);
    names.add(name);

    const questions = await buildAutoModuleQuestions({ moduleConfig: item, schoolId });
    const timeLimit = parseOptionalLimit(item.timeLimit, `timeLimit (${name})`, 5, 180);

    modules.push({ name, questions, timeLimit });
  }

  return modules;
};

// Creates Simulacro + SimulacroModules + SimulacroQuestions in a transaction
const createSimulacroWithModules = async ({ data, modules }) => {
  return prisma.$transaction(async (tx) => {
    const simulacro = await tx.simulacro.create({ data });

    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi];
      const moduleRecord = await tx.simulacroModule.create({
        data: {
          simulacroId: simulacro.id,
          name: mod.name,
          timeLimit: mod.timeLimit,
          order: mi + 1
        }
      });

      for (const q of mod.questions) {
        await tx.simulacroQuestion.create({
          data: {
            moduleId: moduleRecord.id,
            questionId: q.questionId || null,
            embeddedQuestion: q.embeddedQuestion || null,
            order: q.order
          }
        });
      }
    }

    return tx.simulacro.findUnique({ where: { id: simulacro.id }, include: SIMULACRO_INCLUDE });
  });
};

// ── PUBLIC API ────────────────────────────────────────────────────────────────

const createManualSimulacro = async (payload, user) => {
  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const modules = await buildManualModules({
    modulesInput: payload.modules,
    teacherId: user.id,
    schoolId: user.schoolId
  });

  return createSimulacroWithModules({
    data: {
      schoolId: user.schoolId,
      title,
      description: String(payload.description || '').trim(),
      globalTimeLimit: parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 5, 360),
      strictMode: Boolean(payload.strictMode),
      estado: 'borrador',
      createdById: user.id,
      updatedById: user.id
    },
    modules
  });
};

const createSmartSimulacro = async (payload, user) => {
  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const modules = await buildAutoModules({ modulesInput: payload.modules, schoolId: user.schoolId });

  return createSimulacroWithModules({
    data: {
      schoolId: user.schoolId,
      title,
      description: String(payload.description || '').trim(),
      globalTimeLimit: parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 5, 360),
      strictMode: Boolean(payload.strictMode),
      estado: 'borrador',
      createdById: user.id,
      updatedById: user.id
    },
    modules
  });
};

const getSimulacrosByTeacher = async (query, user) => {
  const where = { schoolId: user.schoolId, createdById: user.id };
  if (query.estado) where.estado = query.estado;

  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.simulacro.count({ where }),
    prisma.simulacro.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: limit })
  ]);

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

const getSimulacroById = async (id, userId, role = 'docente') => {
  const simulacro = await prisma.simulacro.findUnique({ where: { id }, include: SIMULACRO_INCLUDE });

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  if (role === 'docente') {
    assertTeacherOwnsSimulacro(simulacro, userId);
  } else if (role === 'estudiante') {
    if (simulacro.estado !== 'publicado') throw buildError('Simulacro no disponible', 403);
  }

  return simulacro;
};

const updateSimulacro = async (id, payload, user) => {
  const simulacro = await prisma.simulacro.findUnique({ where: { id } });
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, user.id);

  if (simulacro.estado !== 'borrador') {
    throw buildError('Solo puedes editar simulacros en borrador', 400);
  }

  const updateData = { updatedById: user.id };

  if (payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) throw buildError('title no puede estar vacio', 400);
    updateData.title = title;
  }
  if (payload.description !== undefined) updateData.description = String(payload.description || '').trim();
  if (payload.strictMode !== undefined) updateData.strictMode = Boolean(payload.strictMode);
  if (payload.globalTimeLimit !== undefined) {
    updateData.globalTimeLimit = parseOptionalLimit(payload.globalTimeLimit, 'globalTimeLimit', 5, 360);
  }

  if (payload.modules !== undefined) {
    // Rebuild modules: delete old, create new (in a transaction)
    const newModules = await buildManualModules({
      modulesInput: payload.modules,
      teacherId: user.id,
      schoolId: user.schoolId
    });

    return prisma.$transaction(async (tx) => {
      const existingModules = await tx.simulacroModule.findMany({ where: { simulacroId: id }, select: { id: true } });
      for (const mod of existingModules) {
        await tx.simulacroQuestion.deleteMany({ where: { moduleId: mod.id } });
      }
      await tx.simulacroModule.deleteMany({ where: { simulacroId: id } });

      await tx.simulacro.update({ where: { id }, data: updateData });

      for (let mi = 0; mi < newModules.length; mi++) {
        const mod = newModules[mi];
        const moduleRecord = await tx.simulacroModule.create({
          data: { simulacroId: id, name: mod.name, timeLimit: mod.timeLimit, order: mi + 1 }
        });
        for (const q of mod.questions) {
          await tx.simulacroQuestion.create({
            data: { moduleId: moduleRecord.id, questionId: q.questionId || null, embeddedQuestion: q.embeddedQuestion || null, order: q.order }
          });
        }
      }

      return tx.simulacro.findUnique({ where: { id }, include: SIMULACRO_INCLUDE });
    });
  }

  return prisma.simulacro.update({ where: { id }, data: updateData, include: SIMULACRO_INCLUDE });
};

const publishSimulacro = async (id, user) => {
  const simulacro = await prisma.simulacro.findUnique({
    where: { id },
    include: { modules: { include: { questions: { select: { id: true } } } } }
  });
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, user.id);

  const totalQuestions = simulacro.modules.reduce(
    (acc, m) => acc + m.questions.length,
    0
  );
  if (totalQuestions < 1) {
    throw buildError('No puedes publicar un simulacro sin preguntas', 400);
  }

  return prisma.simulacro.update({
    where: { id },
    data: { estado: 'publicado', fechaPublicacion: new Date(), updatedById: user.id },
    include: SIMULACRO_INCLUDE
  });
};

const deleteSimulacro = async (id, user) => {
  const simulacro = await prisma.simulacro.findUnique({ where: { id } });
  if (!simulacro) throw buildError('Simulacro no encontrado', 404);

  assertTeacherOwnsSimulacro(simulacro, user.id);

  // Cascade deletes handled by onDelete: Cascade in schema for modules/questions/results
  await prisma.simulacro.delete({ where: { id } });
};

const getAvailableSimulacrosForStudent = async (query, schoolId) => {
  const where = { schoolId, estado: 'publicado' };

  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.simulacro.count({ where }),
    prisma.simulacro.findMany({
      where,
      select: {
        id: true, title: true, description: true, globalTimeLimit: true,
        strictMode: true, estado: true, fechaPublicacion: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { modules: true } }
      },
      orderBy: [{ fechaPublicacion: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit
    })
  ]);

  return {
    items,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

// ── TRI / SCORING ─────────────────────────────────────────────────────────────

const erfApprox = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-absX * absX);
  return sign * y;
};

const toPercentile = (theta) => {
  const cdf = 0.5 * (1 + erfApprox(Number(theta) / Math.sqrt(2)));
  return Math.max(1, Math.min(99, Math.round(cdf * 100)));
};

const scoreTheta = (answers, questionsMap) => {
  if (!answers.length) return 0;
  let weighted = 0;
  let totalWeight = 0;

  answers.forEach((answer) => {
    const q = questionsMap.get(String(answer.questionId));
    if (!q) return;
    const isCorrect = String(answer.selectedOption) === String(q.correctAnswer);
    const a = Number(q.triParamA ?? 1);
    const b = Number(q.triParamB ?? 0);
    const sign = isCorrect ? 1 : -1;
    weighted += sign * a * Math.max(0.3, 1 - Math.abs(b) / 3);
    totalWeight += Math.max(a, 0.1);
  });

  if (totalWeight === 0) return 0;
  return Math.max(-3, Math.min(3, Number(((weighted / totalWeight) * 3).toFixed(4))));
};

// ── EXAM SESSION ──────────────────────────────────────────────────────────────

const startSimulacro = async (simulacroId, studentId, schoolId) => {
  const simulacro = await prisma.simulacro.findUnique({
    where: { id: simulacroId },
    include: SIMULACRO_INCLUDE
  });

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);
  if (simulacro.estado !== 'publicado') throw buildError('Simulacro no disponible', 403);

  const previous = await prisma.simulacroResult.findFirst({
    where: { simulacroId, studentId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' }
  });

  if (previous) {
    return { attemptId: previous.id, resumed: true, simulacro };
  }

  const attempt = await prisma.simulacroResult.create({
    data: {
      simulacroId,
      studentId,
      schoolId,
      status: 'in_progress',
      startTime: new Date(),
      moduleTimes: {
        create: simulacro.modules.map((m) => ({ moduleName: m.name, secondsSpent: 0 }))
      }
    }
  });

  return { attemptId: attempt.id, resumed: false, simulacro };
};

const submitSimulacro = async ({
  simulacroId,
  studentId,
  schoolId,
  answersInput,
  moduleTimesInput,
  markedForReviewInput
}) => {
  const simulacro = await prisma.simulacro.findUnique({
    where: { id: simulacroId },
    include: SIMULACRO_INCLUDE
  });

  if (!simulacro) throw buildError('Simulacro no encontrado', 404);
  if (simulacro.estado !== 'publicado') throw buildError('Simulacro no disponible', 403);

  const attempt = await prisma.simulacroResult.findFirst({
    where: { simulacroId, studentId, status: 'in_progress' },
    orderBy: { createdAt: 'desc' }
  });
  if (!attempt) throw buildError('No hay un intento activo para este simulacro', 400);

  // Build maps for validation and scoring
  const sqByQuestionId = new Map(); // questionId → SimulacroQuestion.id
  const questionsMap = new Map();    // questionId → Question data

  for (const mod of simulacro.modules) {
    for (const sq of mod.questions) {
      const qId = sq.questionId || (sq.embeddedQuestion ? `embedded-${sq.id}` : null);
      if (!qId) continue;
      sqByQuestionId.set(qId, sq.id);
      if (sq.question) questionsMap.set(qId, sq.question);
    }
  }

  const moduleByQuestionId = new Map();
  const sqIdToModuleName = new Map(); // SimulacroQuestion.id → module name (for engagement hook)
  for (const mod of simulacro.modules) {
    for (const sq of mod.questions) {
      if (sq.questionId) moduleByQuestionId.set(sq.questionId, mod.name);
      sqIdToModuleName.set(sq.id, mod.name);
    }
  }

  const answersArray = Array.isArray(answersInput) ? answersInput : [];
  const dedupMap = new Map();

  for (const item of answersArray) {
    const questionId = String(item.questionId || '');
    const selectedOption = String(item.selectedOption || '').toUpperCase();
    const sqId = sqByQuestionId.get(questionId);

    if (!sqId) throw buildError('Una respuesta contiene questionId invalido para este simulacro', 400);
    if (!['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(selectedOption)) {
      throw buildError('selectedOption invalida', 400);
    }

    const q = questionsMap.get(questionId);
    dedupMap.set(questionId, {
      simulacroQuestionId: sqId,
      selectedOption,
      isCorrect: q ? selectedOption === String(q.correctAnswer) : null
    });
  }

  const dedupedAnswers = Array.from(dedupMap.values());
  const moduleNames = simulacro.modules.map((m) => m.name);

  const moduleTimes = moduleNames.map((name) => {
    const source = Array.isArray(moduleTimesInput)
      ? moduleTimesInput.find((t) => t && t.moduleName === name)
      : null;
    return { moduleName: name, secondsSpent: Math.max(0, Number(source?.secondsSpent || 0)) };
  });

  const thetasByModule = moduleNames.map((name) => {
    const answersForModule = dedupedAnswers.filter(
      (a) => moduleByQuestionId.get(
        Object.keys(Object.fromEntries(sqByQuestionId)).find((k) => sqByQuestionId.get(k) === a.simulacroQuestionId)
      ) === name
    );
    return { moduleName: name, theta: scoreTheta(answersForModule, questionsMap) };
  });

  const overallTheta = thetasByModule.length
    ? Number(
        (
          thetasByModule.reduce((sum, t) => sum + Number(t.theta || 0), 0) / thetasByModule.length
        ).toFixed(4)
      )
    : 0;

  const percentile = toPercentile(overallTheta);
  const markIds = Array.isArray(markedForReviewInput)
    ? markedForReviewInput.filter((id) => typeof id === 'string')
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.simulacroAnswer.deleteMany({ where: { resultId: attempt.id } });
    await tx.simulacroModuleTime.deleteMany({ where: { resultId: attempt.id } });
    await tx.simulacroModuleTheta.deleteMany({ where: { resultId: attempt.id } });

    for (const a of dedupedAnswers) {
      await tx.simulacroAnswer.create({ data: { resultId: attempt.id, ...a } });
    }
    for (const t of moduleTimes) {
      await tx.simulacroModuleTime.create({ data: { resultId: attempt.id, ...t } });
    }
    for (const t of thetasByModule) {
      await tx.simulacroModuleTheta.create({ data: { resultId: attempt.id, ...t } });
    }

    await tx.simulacroResult.update({
      where: { id: attempt.id },
      data: { overallTheta, percentile, endTime: new Date(), status: 'submitted', markedForReview: markIds }
    });
  });

  // Engagement tracking — fire and forget, never fails the submit
  const { processStudentActivity, normalizeArea } = require('./engagementService');
  (async () => {
    try {
      const submittedCount = await prisma.simulacroResult.count({ where: { studentId, status: 'submitted' } });

      const moduleCorrect = new Map();
      for (const a of dedupedAnswers) {
        const modName = sqIdToModuleName.get(a.simulacroQuestionId);
        if (!modName) continue;
        const e = moduleCorrect.get(modName) || { correct: 0, total: 0 };
        e.total++;
        if (a.isCorrect) e.correct++;
        moduleCorrect.set(modName, e);
      }
      const resultadoPorArea = {};
      for (const [mod, { correct, total }] of moduleCorrect) {
        const area = normalizeArea(mod);
        if (area && total > 0) resultadoPorArea[area] = Math.round((correct / total) * 100);
      }

      await processStudentActivity(studentId, schoolId, { resultadoPorArea, esElPrimero: submittedCount === 1 });
    } catch (err) {
      console.error('[engagement] submit hook:', err.message);
    }
  })();

  return prisma.simulacroResult.findUnique({
    where: { id: attempt.id },
    include: {
      simulacro: { select: { title: true, globalTimeLimit: true, strictMode: true } },
      answers: true,
      moduleTimes: true,
      moduleThetas: true
    }
  });
};

const getStudentResultsForSimulacro = async (simulacroId, studentId) => {
  const result = await prisma.simulacroResult.findFirst({
    where: { simulacroId, studentId, status: 'submitted' },
    orderBy: { createdAt: 'desc' },
    include: {
      simulacro: { select: { title: true, globalTimeLimit: true, strictMode: true } },
      answers: true,
      moduleTimes: true,
      moduleThetas: true
    }
  });

  if (!result) throw buildError('No hay resultados para este simulacro', 404);

  return result;
};

// Average overallTheta / per-module theta across peers who already submitted the
// same simulacro — one cohort scoped to the student's course(s), one scoped to
// the whole school. Used to power the "Promedio del curso / institucional"
// comparison in the results screen (real peer data, not a simulated distribution).
const avg = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

const summarizeCohort = (rows) => {
  const moduleMap = new Map();
  rows.forEach((row) => {
    (row.moduleThetas || []).forEach((mt) => {
      if (!moduleMap.has(mt.moduleName)) moduleMap.set(mt.moduleName, []);
      moduleMap.get(mt.moduleName).push(Number(mt.theta));
    });
  });

  return {
    count: rows.length,
    avgOverallTheta: avg(rows.map((row) => Number(row.overallTheta ?? 0))),
    modules: Array.from(moduleMap.entries()).map(([moduleName, thetas]) => ({
      moduleName,
      avgTheta: avg(thetas)
    }))
  };
};

const getSimulacroComparison = async (simulacroId, studentId, schoolId) => {
  const student = await prisma.student.findUnique({ where: { userId: studentId }, select: { id: true } });

  let courseUserIds = [];
  if (student) {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: student.id },
      select: { courseId: true }
    });
    const courseIds = [...new Set(enrollments.map((e) => e.courseId))];

    if (courseIds.length) {
      const courseMates = await prisma.courseEnrollment.findMany({
        where: { courseId: { in: courseIds } },
        select: { student: { select: { userId: true } } }
      });
      courseUserIds = [...new Set(courseMates.map((cm) => cm.student.userId))].filter((uid) => uid !== studentId);
    }
  }

  const cohortSelect = { overallTheta: true, moduleThetas: { select: { moduleName: true, theta: true } } };

  const [courseRows, schoolRows] = await Promise.all([
    courseUserIds.length
      ? prisma.simulacroResult.findMany({
          where: { simulacroId, status: 'submitted', studentId: { in: courseUserIds } },
          select: cohortSelect
        })
      : [],
    prisma.simulacroResult.findMany({
      where: { simulacroId, status: 'submitted', schoolId, NOT: { studentId } },
      select: cohortSelect
    })
  ]);

  return {
    course: summarizeCohort(courseRows),
    school: summarizeCohort(schoolRows)
  };
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
  getStudentResultsForSimulacro,
  getSimulacroComparison
};
