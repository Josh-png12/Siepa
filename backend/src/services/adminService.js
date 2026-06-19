const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const { parsePagination, validateUserCreate, validateCourseCreate } = require('../validators/adminValidators');

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

// ── USERS ─────────────────────────────────────────────────────────────────────

const listUsers = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const where = { schoolId, deletedAt: null };

  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;

  const searchTerm = query.search || query.q;
  if (searchTerm) {
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } }
    ];
  }

  if (query.course) {
    const course = await prisma.course.findFirst({
      where: { id: query.course, schoolId },
      include: {
        teacherAssignments: { select: { teacherId: true } },
        enrollments: { include: { student: { select: { userId: true } } } }
      }
    });
    if (!course) return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    const teacherIds = course.teacherAssignments.map((ta) => ta.teacherId);
    const studentUserIds = course.enrollments.map((e) => e.student.userId);
    where.id = { in: [...new Set([...teacherIds, course.teacherId, ...studentUserIds])] };
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: { password: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.user.count({ where })
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const resetUserPassword = async ({ schoolId, userId, newPassword }) => {
  if (!newPassword || String(newPassword).length < 6) throw buildError('newPassword minimo 6 caracteres', 400);

  const hashedPassword = await bcrypt.hash(String(newPassword), 10);
  const user = await prisma.user.findFirst({ where: { id: userId, schoolId, deletedAt: null } });
  if (!user) throw buildError('Usuario no encontrado', 404);

  return prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
    omit: { password: true }
  });
};

const createUser = async ({ schoolId, payload }) => {
  const errors = validateUserCreate(payload);
  if (errors.length) throw buildError(errors.join(', '), 400);

  const email = String(payload.email).toLowerCase().trim();
  const existing = await prisma.user.findFirst({ where: { email, schoolId } });
  if (existing) throw buildError('email ya registrado en esta escuela', 409);

  const hashedPassword = await bcrypt.hash(String(payload.password), 10);

  const user = await prisma.user.create({
    data: {
      schoolId,
      name: String(payload.name).trim(),
      email,
      password: hashedPassword,
      role: payload.role,
      status: payload.status || 'active',
      featurePhysicalSimulacros: Boolean(payload?.features?.physicalSimulacros),
      featureOcrEnabled: payload?.features?.ocrEnabled !== false
    },
    omit: { password: true }
  });

  return user;
};

const updateUser = async ({ schoolId, userId, payload }) => {
  const user = await prisma.user.findFirst({ where: { id: userId, schoolId, deletedAt: null } });
  if (!user) throw buildError('Usuario no encontrado', 404);

  const updateData = {};
  if (payload.name !== undefined) updateData.name = String(payload.name);
  if (payload.role !== undefined) updateData.role = payload.role;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.features !== undefined) {
    if (payload.features.physicalSimulacros !== undefined) {
      updateData.featurePhysicalSimulacros = Boolean(payload.features.physicalSimulacros);
    }
    if (payload.features.ocrEnabled !== undefined) {
      updateData.featureOcrEnabled = Boolean(payload.features.ocrEnabled);
    }
  }
  if (payload.password) updateData.password = await bcrypt.hash(String(payload.password), 10);

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    omit: { password: true }
  });
};

const softDeleteUser = async ({ schoolId, userId }) => {
  const user = await prisma.user.findFirst({ where: { id: userId, schoolId, deletedAt: null } });
  if (!user) throw buildError('Usuario no encontrado', 404);

  return prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), status: 'inactive' },
    omit: { password: true }
  });
};

const importUsers = async ({ schoolId, fileBuffer }) => {
  if (!fileBuffer) throw buildError('Archivo de importacion requerido', 400);

  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: '' });

  if (!rows.length) throw buildError('El archivo no contiene filas', 400);

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const [index, row] of rows.entries()) {
    try {
      const email = String(row.email || '').toLowerCase().trim();
      const name = String(row.name || '').trim();
      const role = String(row.role || '').trim();
      const password = String(row.password || '').trim() || 'Temp1234*';

      if (!email || !name || !['admin', 'docente', 'estudiante'].includes(role)) {
        throw new Error('Fila invalida: requiere name/email/role validos');
      }

      // Multi-tenant dedup: same email is allowed in different schools
      const exists = await prisma.user.findFirst({ where: { email, schoolId } });
      if (exists) { skipped += 1; continue; }

      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.create({ data: { schoolId, name, email, password: hashedPassword, role } });
      created += 1;
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
    }
  }

  return { created, skipped, errors };
};

// ── COURSES ───────────────────────────────────────────────────────────────────

const COURSE_INCLUDE = {
  teacher: { select: { id: true, name: true, email: true, role: true } },
  enrollments: {
    include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } }
  }
};

const listCourses = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const where = { schoolId, deletedAt: null };

  if (query.status) where.status = query.status;
  if (query.teacherId) where.teacherId = query.teacherId;
  if (query.search || query.q) where.name = { contains: query.search || query.q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: COURSE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.course.count({ where })
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const createCourse = async ({ schoolId, payload }) => {
  const errors = validateCourseCreate(payload);
  if (errors.length) throw buildError(errors.join(', '), 400);
  if (!payload.teacher) throw buildError('teacher es requerido', 400);

  const teacher = await prisma.user.findFirst({
    where: { id: payload.teacher, schoolId, role: { in: ['docente', 'admin'] }, deletedAt: null }
  });
  if (!teacher) throw buildError('Docente no encontrado', 404);

  return prisma.course.create({
    data: {
      schoolId,
      name: String(payload.name).trim(),
      grade: String(payload.grade).trim(),
      year: String(payload.year).trim(),
      teacherId: teacher.id
    },
    include: COURSE_INCLUDE
  });
};

const updateCourse = async ({ schoolId, courseId, payload }) => {
  const course = await prisma.course.findFirst({ where: { id: courseId, schoolId, deletedAt: null } });
  if (!course) throw buildError('Curso no encontrado', 404);

  const updateData = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.grade !== undefined) updateData.grade = payload.grade;
  if (payload.year !== undefined) updateData.year = payload.year;
  if (payload.status !== undefined) updateData.status = payload.status;

  return prisma.course.update({ where: { id: courseId }, data: updateData, include: COURSE_INCLUDE });
};

const softDeleteCourse = async ({ schoolId, courseId }) => {
  const course = await prisma.course.findFirst({ where: { id: courseId, schoolId, deletedAt: null } });
  if (!course) throw buildError('Curso no encontrado', 404);

  return prisma.course.update({
    where: { id: courseId },
    data: { deletedAt: new Date(), status: 'inactive' }
  });
};

const assignTeacher = async ({ schoolId, courseId, teacherId }) => {
  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, schoolId, role: { in: ['docente', 'admin'] }, deletedAt: null }
  });
  if (!teacher) throw buildError('Docente no encontrado', 404);

  const course = await prisma.course.findFirst({ where: { id: courseId, schoolId, deletedAt: null } });
  if (!course) throw buildError('Curso no encontrado', 404);

  return prisma.course.update({
    where: { id: courseId },
    data: { teacherId: teacher.id },
    include: COURSE_INCLUDE
  });
};

const assignStudents = async ({ schoolId, courseId, studentIds }) => {
  const list = Array.isArray(studentIds) ? studentIds : [];

  const students = await prisma.user.findMany({
    where: { id: { in: list }, schoolId, role: 'estudiante', deletedAt: null },
    select: { id: true }
  });

  const course = await prisma.course.findFirst({ where: { id: courseId, schoolId, deletedAt: null } });
  if (!course) throw buildError('Curso no encontrado', 404);

  // Resolve Student records from User IDs (need Student.id for CourseEnrollment)
  const studentRecords = await prisma.student.findMany({
    where: { userId: { in: students.map((u) => u.id) } },
    select: { id: true }
  });

  // Replace all enrollments atomically
  await prisma.$transaction([
    prisma.courseEnrollment.deleteMany({ where: { courseId } }),
    ...studentRecords.map((sr) =>
      prisma.courseEnrollment.create({ data: { courseId, studentId: sr.id } })
    )
  ]);

  return prisma.course.findUnique({ where: { id: courseId }, include: COURSE_INCLUDE });
};

// ── QUESTIONS ─────────────────────────────────────────────────────────────────

const listQuestions = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const where = { schoolId };

  if (query.estado) where.estado = query.estado;
  if (query.area) where.area = query.area;
  if (query.competencia) where.competencia = query.competencia;
  if (query.createdBy) where.createdById = query.createdBy;
  if (query.q) {
    where.OR = [
      { statementText: { contains: query.q, mode: 'insensitive' } },
      { competencia: { contains: query.q, mode: 'insensitive' } },
      { area: { contains: query.q, mode: 'insensitive' } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select: {
        id: true, statementText: true, area: true, competencia: true, estado: true,
        triParamA: true, triParamB: true, triParamC: true,
        calibrationStatus: true, createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.question.count({ where })
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const getQuestionStatsByArea = async ({ schoolId }) => {
  // COUNT FILTER requires raw SQL — Prisma groupBy does not support conditional aggregates
  const rows = await prisma.$queryRaw`
    SELECT
      area,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estado = 'publicada')::int AS publicadas,
      COUNT(*) FILTER (WHERE "calibrationStatus" = 'calibrated')::int AS calibradas
    FROM "Question"
    WHERE "schoolId" = ${schoolId}
    GROUP BY area
    ORDER BY COUNT(*) DESC
  `;

  return rows.map((row) => ({
    area: row.area || 'sin-area',
    total: Number(row.total),
    publicadas: Number(row.publicadas),
    calibradas: Number(row.calibradas)
  }));
};

const moderateQuestion = async ({ schoolId, questionId, action }) => {
  const question = await prisma.question.findFirst({ where: { id: questionId, schoolId } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  const patch = action === 'approve'
    ? { estado: 'publicada', calibrationStatus: 'calibrated' }
    : { estado: 'borrador' };

  return prisma.question.update({ where: { id: questionId }, data: patch });
};

const updateQuestionTriParams = async ({ schoolId, questionId, triParams }) => {
  const a = Number(triParams?.a);
  const b = Number(triParams?.b);
  const c = Number(triParams?.c);

  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
    throw buildError('triParams invalidos', 400);
  }

  const question = await prisma.question.findFirst({ where: { id: questionId, schoolId } });
  if (!question) throw buildError('Pregunta no encontrada', 404);

  return prisma.question.update({
    where: { id: questionId },
    data: { triParamA: a, triParamB: b, triParamC: c }
  });
};

// ── PHYSICAL SIMULACROS ────────────────────────────────────────────────────────

const listPhysicalSimulacros = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const where = { schoolId };
  if (query.status) where.status = query.status;

  const [items, total] = await Promise.all([
    prisma.physicalSimulacro.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        courses: { select: { id: true, name: true, grade: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    }),
    prisma.physicalSimulacro.count({ where })
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const listGovernanceSimulacros = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);

  const [virtuales, fisicos] = await Promise.all([
    prisma.simulacro.findMany({
      where: { schoolId },
      select: {
        id: true, title: true, estado: true, createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } }
      }
    }),
    prisma.physicalSimulacro.findMany({
      where: { schoolId },
      select: {
        id: true, title: true, status: true, createdAt: true,
        teacher: { select: { id: true, name: true, email: true } }
      }
    })
  ]);

  const merged = [
    ...virtuales.map((item) => ({ id: item.id, type: 'virtual', title: item.title, status: item.estado, owner: item.createdBy, createdAt: item.createdAt })),
    ...fisicos.map((item) => ({ id: item.id, type: 'physical', title: item.title, status: item.status, owner: item.teacher, createdAt: item.createdAt }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    items: merged.slice(skip, skip + limit),
    pagination: { page, limit, total: merged.length, totalPages: Math.ceil(merged.length / limit) }
  };
};

const createPhysicalSimulacro = async ({ schoolId, payload }) => {
  const required = ['title', 'teacher', 'courses', 'date', 'startTime', 'endTime', 'totalQuestions'];
  for (const field of required) {
    if (!payload[field]) throw buildError(`${field} es requerido`, 400);
  }

  return prisma.physicalSimulacro.create({
    data: {
      schoolId,
      title: payload.title,
      description: payload.description || '',
      teacherId: payload.teacher,
      date: new Date(payload.date),
      startTime: payload.startTime,
      endTime: payload.endTime,
      totalQuestions: payload.totalQuestions,
      reviewDeadline: payload.reviewDeadline ? new Date(payload.reviewDeadline) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'draft',
      courses: { connect: (payload.courses || []).map((id) => ({ id })) }
    }
  });
};

const updatePhysicalSimulacroStatus = async ({ schoolId, simulacroId, status }) => {
  const doc = await prisma.physicalSimulacro.findFirst({ where: { id: simulacroId, schoolId } });
  if (!doc) throw buildError('Simulacro fisico no encontrado', 404);

  const patch = { status };
  if (status === 'published') patch.publishedAt = new Date();
  if (status === 'archived') patch.archivedAt = new Date();
  if (status === 'reviewing') patch.archivedAt = null;

  return prisma.physicalSimulacro.update({ where: { id: simulacroId }, data: patch });
};

const forceArchiveSimulacro = async ({ schoolId, simulacroId, type }) => {
  if (type === 'physical') {
    return updatePhysicalSimulacroStatus({ schoolId, simulacroId, status: 'archived' });
  }
  const simulacro = await prisma.simulacro.findFirst({ where: { id: simulacroId, schoolId } });
  if (!simulacro) throw buildError('Simulacro virtual no encontrado', 404);
  return prisma.simulacro.update({ where: { id: simulacroId }, data: { estado: 'cerrado' } });
};

// ── PHYSICAL TEMPLATES ────────────────────────────────────────────────────────

const listPhysicalTemplates = async ({ schoolId }) =>
  prisma.physicalTemplate.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' } });

const createPhysicalTemplate = async ({ schoolId, payload, file }) => {
  if (!file) throw buildError('Archivo PDF requerido', 400);

  if (payload.isActive) {
    await prisma.physicalTemplate.updateMany({ where: { schoolId }, data: { isActive: false } });
  }

  return prisma.physicalTemplate.create({
    data: {
      schoolId,
      name: payload.name || 'Plantilla fisica',
      version: payload.version || `v${Date.now()}`,
      pdfBasePath: `/uploads/physical-templates/${file.filename}`,
      coordinateJSON: payload.coordinateJSON || {},
      isActive: Boolean(payload.isActive),
      createdById: payload.createdBy
    }
  });
};

const updatePhysicalTemplate = async ({ schoolId, templateId, payload }) => {
  const template = await prisma.physicalTemplate.findFirst({ where: { id: templateId, schoolId } });
  if (!template) throw buildError('Plantilla no encontrada', 404);

  const updated = await prisma.physicalTemplate.update({ where: { id: templateId }, data: payload });

  if (updated.isActive) {
    await prisma.physicalTemplate.updateMany({
      where: { schoolId, id: { not: updated.id } },
      data: { isActive: false }
    });
  }

  return updated;
};

const deletePhysicalTemplate = async ({ schoolId, templateId }) => {
  const template = await prisma.physicalTemplate.findFirst({ where: { id: templateId, schoolId } });
  if (!template) throw buildError('Plantilla no encontrada', 404);
  return prisma.physicalTemplate.delete({ where: { id: templateId } });
};

// ── SYSTEM CONFIG ─────────────────────────────────────────────────────────────

const getSystemConfig = async ({ schoolId }) =>
  prisma.systemConfig.upsert({
    where: { schoolId },
    create: { schoolId },
    update: {}
  });

const updateSystemConfig = async ({ schoolId, payload }) => {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const patch = {};

  if (safe.maxUploadMB !== undefined) patch.maxUploadMB = Number(safe.maxUploadMB);
  if (safe.ocrReviewWindowDays !== undefined) patch.ocrReviewWindowDays = Number(safe.ocrReviewWindowDays);
  if (safe.fileRetentionDays !== undefined) patch.fileRetentionDays = Number(safe.fileRetentionDays);
  if (safe.featuresEnabled && typeof safe.featuresEnabled === 'object') {
    if (safe.featuresEnabled.physicalSimulacrosGlobal !== undefined) {
      patch.featurePhysicalGlobal = Boolean(safe.featuresEnabled.physicalSimulacrosGlobal);
    }
    if (safe.featuresEnabled.ocrGlobal !== undefined) {
      patch.featureOcrGlobal = Boolean(safe.featuresEnabled.ocrGlobal);
    }
    if (safe.featuresEnabled.questionModeration !== undefined) {
      patch.featureModeration = Boolean(safe.featuresEnabled.questionModeration);
    }
  }

  return prisma.systemConfig.upsert({
    where: { schoolId },
    create: { schoolId, ...patch },
    update: patch
  });
};

// ── AUDIT LOGS ────────────────────────────────────────────────────────────────

const getAuditLogs = async ({ schoolId, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const where = { schoolId };

  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  if (query.entityType) where.entityType = query.entityType;
  if (query.course) where.courseId = query.course;
  if (query.startDate || query.endDate) {
    where.timestamp = {};
    if (query.startDate) where.timestamp.gte = new Date(query.startDate);
    if (query.endDate) where.timestamp.lte = new Date(query.endDate);
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit
    }),
    prisma.auditLog.count({ where })
  ]);

  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ── GOVERNANCE STATS ──────────────────────────────────────────────────────────

const governanceStatsCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getGovernanceStats = async ({ schoolId, forceRefresh = false }) => {
  const now = Date.now();
  const cached = governanceStatsCache.get(schoolId);
  if (!forceRefresh && cached && now - cached.createdAt < CACHE_TTL_MS) return cached.value;

  const simulacros = await prisma.physicalSimulacro.findMany({
    where: { schoolId },
    include: { courses: { select: { id: true, enrollments: { select: { studentId: true } } } } },
    select: { id: true, title: true, status: true, totalQuestions: true, createdAt: true, courses: true }
  });

  const simulacroIds = simulacros.map((s) => s.id);

  const sheetStats = simulacroIds.length
    ? await prisma.$queryRaw`
        SELECT
          "physicalSimulacroId",
          COUNT(*)::int AS "sheetsReceived",
          COUNT(*) FILTER (WHERE status = 'needsReview')::int AS "pendingReview",
          COUNT(*) FILTER (WHERE status = 'duplicate')::int AS "duplicates",
          COUNT(*) FILTER (WHERE status = 'invalid')::int AS "invalid"
        FROM "PhysicalAnswerSheet"
        WHERE "physicalSimulacroId" IN (${Prisma.join(simulacroIds)})
        GROUP BY "physicalSimulacroId"
      `
    : [];

  const statsMap = new Map(sheetStats.map((row) => [String(row.physicalSimulacroId), row]));

  const rows = simulacros.map((simulacro) => {
    const stats = statsMap.get(simulacro.id) || {};
    const expectedStudents = new Set(
      simulacro.courses.flatMap((c) => (c.enrollments || []).map((e) => e.studentId))
    ).size;

    return {
      simulacroId: simulacro.id,
      title: simulacro.title,
      status: simulacro.status,
      expectedStudents,
      sheetsReceived: Number(stats.sheetsReceived || 0),
      pendingReview: Number(stats.pendingReview || 0),
      duplicates: Number(stats.duplicates || 0),
      invalid: Number(stats.invalid || 0)
    };
  });

  const totals = rows.reduce((acc, item) => ({
    expected: acc.expected + item.expectedStudents,
    received: acc.received + item.sheetsReceived,
    pending: acc.pending + item.pendingReview,
    duplicates: acc.duplicates + item.duplicates,
    invalid: acc.invalid + item.invalid
  }), { expected: 0, received: 0, pending: 0, duplicates: 0, invalid: 0 });

  const value = {
    totals,
    rows,
    duplicateRate: totals.received ? Number((totals.duplicates / totals.received).toFixed(4)) : 0
  };

  governanceStatsCache.set(schoolId, { createdAt: now, value });
  return value;
};

// ── INSTITUTION METRICS ────────────────────────────────────────────────────────

const computeInstitutionMetricsSnapshot = async ({ schoolId }) => {
  const students = await prisma.user.findMany({
    where: { schoolId, role: 'estudiante', deletedAt: null },
    select: { id: true }
  });
  const studentIds = students.map((s) => s.id);
  const date = new Date(new Date().toISOString().slice(0, 10));

  if (!studentIds.length) {
    return prisma.institutionMetrics.upsert({
      where: { schoolId_date: { schoolId, date } },
      create: { schoolId, date, metrics: { thetaDistribution: [], competencyBreakdown: [], riskCognitiveIndex: 0, crossCourseComparison: [], teacherPerformance: [] } },
      update: { metrics: { thetaDistribution: [], competencyBreakdown: [], riskCognitiveIndex: 0, crossCourseComparison: [], teacherPerformance: [] } }
    });
  }

  const [progresses, courses] = await Promise.all([
    prisma.studentProgress.findMany({
      where: { studentId: { in: studentIds } },
      include: { competencies: true }
    }),
    prisma.course.findMany({
      where: { schoolId, deletedAt: null },
      include: {
        enrollments: { include: { student: { select: { userId: true } } } }
      }
    })
  ]);

  const thetaDistribution = progresses.map((p) => Number(p.currentTheta || 0));

  const competencyMap = new Map();
  progresses.forEach((progress) => {
    (progress.competencies || []).forEach((entry) => {
      const key = String(entry.area || '').toLowerCase();
      if (!key) return;
      if (!competencyMap.has(key)) competencyMap.set(key, { sum: 0, count: 0 });
      const row = competencyMap.get(key);
      row.sum += Number(entry.theta || 0);
      row.count += 1;
    });
  });
  const competencyBreakdown = [...competencyMap.entries()].map(([competencia, value]) => ({
    competencia,
    avgTheta: Number((value.sum / Math.max(1, value.count)).toFixed(2)),
    sampleSize: value.count
  }));

  const progressMap = new Map(progresses.map((p) => [p.studentId, Number(p.currentTheta || 0)]));

  const crossCourseComparison = courses.map((course) => {
    const courseStudentIds = (course.enrollments || []).map((e) => e.student.userId);
    const values = courseStudentIds.map((id) => progressMap.get(id)).filter((v) => Number.isFinite(v));
    const avgTheta = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0;
    return { courseId: course.id, avgTheta, riskStudents: values.filter((v) => v < 0.4).length };
  });

  const teacherMap = new Map();
  courses.forEach((course, idx) => {
    const key = course.teacherId;
    if (!teacherMap.has(key)) teacherMap.set(key, { totalTheta: 0, courses: 0, atRisk: 0 });
    const row = teacherMap.get(key);
    const comp = crossCourseComparison[idx];
    row.totalTheta += comp.avgTheta;
    row.courses += 1;
    row.atRisk += comp.riskStudents;
  });
  const teacherPerformance = [...teacherMap.entries()].map(([teacherId, value]) => ({
    teacherId,
    avgTheta: Number((value.totalTheta / Math.max(1, value.courses)).toFixed(2)),
    atRiskStudents: value.atRisk
  }));

  const riskCognitiveIndex = progresses.length
    ? Number((progresses.filter((p) => Number(p.currentTheta || 0) < 0.4).length / progresses.length).toFixed(4))
    : 0;

  const metrics = { thetaDistribution, competencyBreakdown, riskCognitiveIndex, crossCourseComparison, teacherPerformance };

  return prisma.institutionMetrics.upsert({
    where: { schoolId_date: { schoolId, date } },
    create: { schoolId, date, metrics },
    update: { metrics }
  });
};

const getInstitutionMetrics = async ({ schoolId, forceRefresh = false }) => {
  if (forceRefresh) return computeInstitutionMetricsSnapshot({ schoolId });
  const latest = await prisma.institutionMetrics.findFirst({ where: { schoolId }, orderBy: { date: 'desc' } });
  if (latest) return latest;
  return computeInstitutionMetricsSnapshot({ schoolId });
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  softDeleteUser,
  importUsers,
  listCourses,
  createCourse,
  updateCourse,
  softDeleteCourse,
  assignTeacher,
  assignStudents,
  listQuestions,
  getQuestionStatsByArea,
  moderateQuestion,
  updateQuestionTriParams,
  listPhysicalSimulacros,
  listGovernanceSimulacros,
  createPhysicalSimulacro,
  updatePhysicalSimulacroStatus,
  forceArchiveSimulacro,
  listPhysicalTemplates,
  createPhysicalTemplate,
  updatePhysicalTemplate,
  deletePhysicalTemplate,
  getSystemConfig,
  updateSystemConfig,
  getAuditLogs,
  getGovernanceStats,
  getInstitutionMetrics
};
