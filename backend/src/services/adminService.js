const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Question = require('../models/Question');
const Simulacro = require('../models/Simulacro');
const PhysicalSimulacro = require('../models/PhysicalSimulacro');
const PhysicalTemplate = require('../models/PhysicalTemplate');
const PhysicalAnswerSheet = require('../models/PhysicalAnswerSheet');
const StudentProgress = require('../models/StudentProgress');
const SystemConfig = require('../models/SystemConfig');
const AuditLog = require('../models/AuditLog');
const InstitutionMetrics = require('../models/InstitutionMetrics');
const { parsePagination, validateUserCreate, validateCourseCreate } = require('../validators/adminValidators');

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const applyInstitutionFilter = (baseFilter, institutionFilter) => ({
  ...baseFilter,
  ...institutionFilter
});

const listUsers = async ({ institutionId, institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = applyInstitutionFilter(
    { deletedAt: null },
    institutionFilter
  );

  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  const searchTerm = query.search || query.q;
  if (searchTerm) {
    filter.$and = filter.$and || [];
    filter.$and.push({
      $or: [
        { name: new RegExp(searchTerm, 'i') },
        { email: new RegExp(searchTerm, 'i') }
      ]
    });
  }

  let userIdsByCourse = null;
  if (query.course) {
    const course = await Course.findOne(applyInstitutionFilter({ _id: query.course }, institutionFilter))
      .select('students teacher')
      .lean();
    if (!course) return { items: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    userIdsByCourse = [...new Set([...(course.students || []).map(String), String(course.teacher)])];
    filter._id = { $in: userIdsByCourse.map((id) => toObjectId(id)) };
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter)
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const resetUserPassword = async ({ institutionFilter, userId, newPassword }) => {
  if (!newPassword || String(newPassword).length < 6) {
    throw buildError('newPassword minimo 6 caracteres', 400);
  }
  const hashedPassword = await bcrypt.hash(String(newPassword), 10);
  const user = await User.findOneAndUpdate(
    applyInstitutionFilter({ _id: userId, deletedAt: null }, institutionFilter),
    { $set: { password: hashedPassword } },
    { new: true }
  )
    .select('-password')
    .lean();
  if (!user) throw buildError('Usuario no encontrado', 404);
  return user;
};

const createUser = async ({ institutionId, payload }) => {
  const errors = validateUserCreate(payload);
  if (errors.length) throw buildError(errors.join(', '), 400);

  const existing = await User.findOne({ email: String(payload.email).toLowerCase() }).lean();
  if (existing) throw buildError('email ya registrado', 409);

  const hashedPassword = await bcrypt.hash(String(payload.password), 10);

  const user = await User.create({
    institutionId,
    name: String(payload.name).trim(),
    email: String(payload.email).toLowerCase().trim(),
    password: hashedPassword,
    role: payload.role,
    status: payload.status || 'active',
    features: {
      physicalSimulacros: Boolean(payload?.features?.physicalSimulacros),
      ocrEnabled: payload?.features?.ocrEnabled !== false
    }
  });

  return User.findById(user._id).select('-password').lean();
};

const updateUser = async ({ institutionFilter, userId, payload }) => {
  const update = {};
  if (payload.name !== undefined) update.name = String(payload.name);
  if (payload.role !== undefined) update.role = payload.role;
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.features !== undefined) {
    if (payload.features.physicalSimulacros !== undefined) {
      update['features.physicalSimulacros'] = Boolean(payload.features.physicalSimulacros);
    }
    if (payload.features.ocrEnabled !== undefined) {
      update['features.ocrEnabled'] = Boolean(payload.features.ocrEnabled);
    }
  }
  if (payload.password) {
    update.password = await bcrypt.hash(String(payload.password), 10);
  }

  const user = await User.findOneAndUpdate(
    applyInstitutionFilter({ _id: userId, deletedAt: null }, institutionFilter),
    { $set: update },
    { new: true }
  )
    .select('-password')
    .lean();

  if (!user) throw buildError('Usuario no encontrado', 404);
  return user;
};

const softDeleteUser = async ({ institutionFilter, userId }) => {
  const user = await User.findOneAndUpdate(
    applyInstitutionFilter({ _id: userId, deletedAt: null }, institutionFilter),
    { $set: { deletedAt: new Date(), status: 'inactive' } },
    { new: true }
  )
    .select('-password')
    .lean();
  if (!user) throw buildError('Usuario no encontrado', 404);
  return user;
};

const importUsers = async ({ institutionId, fileBuffer }) => {
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
        throw new Error('Fila invalida: requiere name/email/role');
      }
      const exists = await User.findOne({ email }).lean();
      if (exists) {
        skipped += 1;
        continue;
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.create({
        institutionId,
        name,
        email,
        password: hashedPassword,
        role
      });
      created += 1;
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
    }
  }

  return { created, skipped, errors };
};

const listCourses = async ({ institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = applyInstitutionFilter({ deletedAt: null }, institutionFilter);
  if (query.status) filter.status = query.status;
  if (query.teacherId) filter.teacher = query.teacherId;
  if (query.search || query.q) filter.name = new RegExp(query.search || query.q, 'i');

  const [items, total] = await Promise.all([
    Course.find(filter)
      .populate('teacher', 'name email role')
      .populate('students', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter)
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const createCourse = async ({ institutionId, payload }) => {
  const errors = validateCourseCreate(payload);
  if (errors.length) throw buildError(errors.join(', '), 400);
  if (!payload.teacher) throw buildError('teacher es requerido', 400);

  const teacher = await User.findOne({
    _id: payload.teacher,
    institutionId,
    role: { $in: ['docente', 'admin'] },
    deletedAt: null
  }).lean();
  if (!teacher) throw buildError('Docente no encontrado', 404);

  const course = await Course.create({
    institutionId,
    name: String(payload.name).trim(),
    grade: String(payload.grade).trim(),
    year: String(payload.year).trim(),
    teacher: teacher._id,
    students: Array.isArray(payload.students) ? payload.students : []
  });

  return Course.findById(course._id)
    .populate('teacher', 'name email')
    .populate('students', 'name email')
    .lean();
};

const updateCourse = async ({ institutionFilter, courseId, payload }) => {
  const update = {};
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.grade !== undefined) update.grade = payload.grade;
  if (payload.year !== undefined) update.year = payload.year;
  if (payload.status !== undefined) update.status = payload.status;

  const course = await Course.findOneAndUpdate(
    applyInstitutionFilter({ _id: courseId, deletedAt: null }, institutionFilter),
    { $set: update },
    { new: true }
  )
    .populate('teacher', 'name email')
    .populate('students', 'name email')
    .lean();

  if (!course) throw buildError('Curso no encontrado', 404);
  return course;
};

const softDeleteCourse = async ({ institutionFilter, courseId }) => {
  const course = await Course.findOneAndUpdate(
    applyInstitutionFilter({ _id: courseId, deletedAt: null }, institutionFilter),
    { $set: { deletedAt: new Date(), status: 'inactive' } },
    { new: true }
  ).lean();
  if (!course) throw buildError('Curso no encontrado', 404);
  return course;
};

const assignTeacher = async ({ institutionId, institutionFilter, courseId, teacherId }) => {
  const teacher = await User.findOne({
    _id: teacherId,
    institutionId,
    role: { $in: ['docente', 'admin'] },
    deletedAt: null
  }).lean();
  if (!teacher) throw buildError('Docente no encontrado', 404);

  const course = await Course.findOneAndUpdate(
    applyInstitutionFilter({ _id: courseId, deletedAt: null }, institutionFilter),
    { $set: { teacher: teacher._id } },
    { new: true }
  )
    .populate('teacher', 'name email')
    .lean();

  if (!course) throw buildError('Curso no encontrado', 404);
  return course;
};

const assignStudents = async ({ institutionId, institutionFilter, courseId, studentIds }) => {
  const list = Array.isArray(studentIds) ? studentIds : [];
  const students = await User.find({
    _id: { $in: list.map((id) => toObjectId(id)) },
    institutionId,
    role: 'estudiante',
    deletedAt: null
  })
    .select('_id')
    .lean();

  const course = await Course.findOneAndUpdate(
    applyInstitutionFilter({ _id: courseId, deletedAt: null }, institutionFilter),
    { $set: { students: students.map((item) => item._id) } },
    { new: true }
  )
    .populate('students', 'name email')
    .lean();

  if (!course) throw buildError('Curso no encontrado', 404);
  return course;
};

const listQuestions = async ({ institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = applyInstitutionFilter({}, institutionFilter);
  if (query.estado) filter.estado = query.estado;
  if (query.area) filter.area = query.area;
  if (query.competencia) filter.competencia = query.competencia;
  if (query.createdBy) filter['metadata.createdBy'] = query.createdBy;
  if (query.q) {
    filter.$or = [
      { 'statement.text': new RegExp(query.q, 'i') },
      { competencia: new RegExp(query.q, 'i') },
      { area: new RegExp(query.q, 'i') }
    ];
  }

  const [items, total] = await Promise.all([
    Question.find(filter)
      .select('statement.text area competencia estado triParams calibrationStatus metadata createdAt')
      .populate('metadata.createdBy', 'name email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Question.countDocuments(filter)
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const getQuestionStatsByArea = async ({ institutionFilter }) => {
  const stats = await Question.aggregate([
    { $match: institutionFilter },
    {
      $group: {
        _id: '$area',
        total: { $sum: 1 },
        publicadas: {
          $sum: {
            $cond: [{ $eq: ['$estado', 'publicada'] }, 1, 0]
          }
        },
        calibradas: {
          $sum: {
            $cond: [{ $eq: ['$calibrationStatus', 'calibrated'] }, 1, 0]
          }
        }
      }
    },
    { $sort: { total: -1 } }
  ]);
  return stats.map((item) => ({
    area: item._id || 'sin-area',
    total: item.total,
    publicadas: item.publicadas,
    calibradas: item.calibradas
  }));
};

const moderateQuestion = async ({ institutionFilter, questionId, action }) => {
  const patch = action === 'approve'
    ? { estado: 'publicada', calibrationStatus: 'calibrated' }
    : { estado: 'borrador' };

  const question = await Question.findOneAndUpdate(
    applyInstitutionFilter({ _id: questionId }, institutionFilter),
    { $set: patch },
    { new: true }
  ).lean();

  if (!question) throw buildError('Pregunta no encontrada', 404);
  return question;
};

const updateQuestionTriParams = async ({ institutionFilter, questionId, triParams }) => {
  const values = {
    'triParams.a': Number(triParams?.a),
    'triParams.b': Number(triParams?.b),
    'triParams.c': Number(triParams?.c)
  };
  if (!Number.isFinite(values['triParams.a']) || !Number.isFinite(values['triParams.b']) || !Number.isFinite(values['triParams.c'])) {
    throw buildError('triParams invalidos', 400);
  }

  const question = await Question.findOneAndUpdate(
    applyInstitutionFilter({ _id: questionId }, institutionFilter),
    { $set: values },
    { new: true }
  ).lean();

  if (!question) throw buildError('Pregunta no encontrada', 404);
  return question;
};

const listPhysicalSimulacros = async ({ institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = applyInstitutionFilter({}, institutionFilter);
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    PhysicalSimulacro.find(filter)
      .populate('teacher', 'name email')
      .populate('courses', 'name grade')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PhysicalSimulacro.countDocuments(filter)
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const listGovernanceSimulacros = async ({ institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const [virtuales, fisicos] = await Promise.all([
    Simulacro.find(applyInstitutionFilter({}, institutionFilter))
      .select('title estado createdAt createdBy institutionId')
      .populate('createdBy', 'name email')
      .lean(),
    PhysicalSimulacro.find(applyInstitutionFilter({}, institutionFilter))
      .select('title status createdAt teacher institutionId')
      .populate('teacher', 'name email')
      .lean()
  ]);

  const merged = [
    ...virtuales.map((item) => ({
      _id: item._id,
      type: 'virtual',
      title: item.title,
      status: item.estado,
      owner: item.createdBy,
      createdAt: item.createdAt
    })),
    ...fisicos.map((item) => ({
      _id: item._id,
      type: 'physical',
      title: item.title,
      status: item.status,
      owner: item.teacher,
      createdAt: item.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const items = merged.slice(skip, skip + limit);
  return {
    items,
    pagination: {
      page,
      limit,
      total: merged.length,
      totalPages: Math.ceil(merged.length / limit)
    }
  };
};

const createPhysicalSimulacro = async ({ institutionId, payload }) => {
  const required = ['title', 'teacher', 'courses', 'date', 'startTime', 'endTime', 'totalQuestions'];
  for (const field of required) {
    if (!payload[field]) throw buildError(`${field} es requerido`, 400);
  }

  const doc = await PhysicalSimulacro.create({
    institutionId,
    title: payload.title,
    description: payload.description || '',
    teacher: payload.teacher,
    courses: payload.courses,
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    totalQuestions: payload.totalQuestions,
    reviewDeadline: payload.reviewDeadline || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    status: 'draft'
  });

  return PhysicalSimulacro.findById(doc._id).lean();
};

const updatePhysicalSimulacroStatus = async ({ institutionFilter, simulacroId, status }) => {
  const patch = { status };
  if (status === 'published') patch.publishedAt = new Date();
  if (status === 'archived') patch.archivedAt = new Date();
  if (status === 'reviewing') patch.archivedAt = null;

  const doc = await PhysicalSimulacro.findOneAndUpdate(
    applyInstitutionFilter({ _id: simulacroId }, institutionFilter),
    { $set: patch },
    { new: true }
  ).lean();

  if (!doc) throw buildError('Simulacro fisico no encontrado', 404);
  return doc;
};

const forceArchiveSimulacro = async ({ institutionFilter, simulacroId, type }) => {
  if (type === 'physical') {
    return updatePhysicalSimulacroStatus({ institutionFilter, simulacroId, status: 'archived' });
  }
  const simulacro = await Simulacro.findOneAndUpdate(
    applyInstitutionFilter({ _id: simulacroId }, institutionFilter),
    { $set: { estado: 'cerrado' } },
    { new: true }
  ).lean();
  if (!simulacro) throw buildError('Simulacro virtual no encontrado', 404);
  return simulacro;
};

const listPhysicalTemplates = async ({ institutionFilter }) =>
  PhysicalTemplate.find(applyInstitutionFilter({}, institutionFilter))
    .sort({ createdAt: -1 })
    .lean();

const createPhysicalTemplate = async ({ institutionId, payload, file }) => {
  if (!file) throw buildError('Archivo PDF requerido', 400);

  if (payload.isActive) {
    await PhysicalTemplate.updateMany({ institutionId }, { $set: { isActive: false } });
  }

  const doc = await PhysicalTemplate.create({
    institutionId,
    name: payload.name || 'Plantilla fisica',
    version: payload.version || `v${Date.now()}`,
    pdfBasePath: `/uploads/physical-templates/${file.filename}`,
    coordinateJSON: payload.coordinateJSON || {},
    isActive: Boolean(payload.isActive),
    createdBy: payload.createdBy
  });
  return doc.toObject();
};

const updatePhysicalTemplate = async ({ institutionFilter, templateId, payload }) => {
  const template = await PhysicalTemplate.findOneAndUpdate(
    applyInstitutionFilter({ _id: templateId }, institutionFilter),
    { $set: payload },
    { new: true }
  ).lean();
  if (!template) throw buildError('Plantilla no encontrada', 404);
  if (template.isActive) {
    await PhysicalTemplate.updateMany(
      applyInstitutionFilter({ _id: { $ne: template._id } }, institutionFilter),
      { $set: { isActive: false } }
    );
  }
  return template;
};

const deletePhysicalTemplate = async ({ institutionFilter, templateId }) => {
  const template = await PhysicalTemplate.findOneAndDelete(applyInstitutionFilter({ _id: templateId }, institutionFilter)).lean();
  if (!template) throw buildError('Plantilla no encontrada', 404);
  return template;
};

const getSystemConfig = async ({ institutionId }) => {
  let config = await SystemConfig.findOne({ institutionId }).lean();
  if (!config) {
    config = (await SystemConfig.create({ institutionId })).toObject();
  }
  return config;
};

const updateSystemConfig = async ({ institutionId, payload }) => {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const patch = {};
  if (safePayload.maxUploadMB !== undefined) patch.maxUploadMB = Number(safePayload.maxUploadMB);
  if (safePayload.ocrReviewWindowDays !== undefined) patch.ocrReviewWindowDays = Number(safePayload.ocrReviewWindowDays);
  if (safePayload.fileRetentionDays !== undefined) patch.fileRetentionDays = Number(safePayload.fileRetentionDays);
  if (safePayload.featuresEnabled && typeof safePayload.featuresEnabled === 'object') {
    patch.featuresEnabled = {};
    if (safePayload.featuresEnabled.physicalSimulacrosGlobal !== undefined) {
      patch.featuresEnabled.physicalSimulacrosGlobal = Boolean(safePayload.featuresEnabled.physicalSimulacrosGlobal);
    }
    if (safePayload.featuresEnabled.ocrGlobal !== undefined) {
      patch.featuresEnabled.ocrGlobal = Boolean(safePayload.featuresEnabled.ocrGlobal);
    }
    if (safePayload.featuresEnabled.questionModeration !== undefined) {
      patch.featuresEnabled.questionModeration = Boolean(safePayload.featuresEnabled.questionModeration);
    }
    if (!Object.keys(patch.featuresEnabled).length) delete patch.featuresEnabled;
  }

  return SystemConfig.findOneAndUpdate(
    { institutionId },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
};

const getAuditLogs = async ({ institutionFilter, query }) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = applyInstitutionFilter({}, institutionFilter);
  if (query.userId) filter.userId = query.userId;
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.course) filter.courseId = query.course;
  if (query.startDate || query.endDate) {
    filter.timestamp = {};
    if (query.startDate) filter.timestamp.$gte = new Date(query.startDate);
    if (query.endDate) filter.timestamp.$lte = new Date(query.endDate);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter)
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const governanceStatsCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

const getGovernanceStats = async ({ institutionFilter, institutionId, forceRefresh = false }) => {
  const now = Date.now();
  const cacheKey = institutionId;
  const cached = governanceStatsCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.createdAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const simulacros = await PhysicalSimulacro.find(applyInstitutionFilter({}, institutionFilter))
    .select('_id courses status totalQuestions title createdAt')
    .lean();

  const simulacroIds = simulacros.map((item) => item._id);
  const sheets = await PhysicalAnswerSheet.find({ simulacroId: { $in: simulacroIds } })
    .select('simulacroId status errors')
    .lean();

  const bySimulacro = new Map();
  sheets.forEach((sheet) => {
    const key = String(sheet.simulacroId);
    if (!bySimulacro.has(key)) bySimulacro.set(key, []);
    bySimulacro.get(key).push(sheet);
  });

  const courseIds = [...new Set(simulacros.flatMap((item) => (item.courses || []).map(String)))];
  const courses = await Course.find({
    _id: { $in: courseIds.map((id) => toObjectId(id)) },
    ...institutionFilter
  })
    .select('_id students name')
    .lean();
  const courseMap = new Map(courses.map((item) => [String(item._id), item]));

  const rows = simulacros.map((simulacro) => {
    const sheetsForSim = bySimulacro.get(String(simulacro._id)) || [];
    const expectedStudents = (simulacro.courses || [])
      .reduce((acc, courseId) => acc + (courseMap.get(String(courseId))?.students?.length || 0), 0);
    const duplicates = sheetsForSim.filter((sheet) => sheet.status === 'duplicate').length;
    const pendingReview = sheetsForSim.filter((sheet) => sheet.status === 'needsReview').length;
    const invalid = sheetsForSim.filter((sheet) => sheet.status === 'invalid').length;
    return {
      simulacroId: simulacro._id,
      title: simulacro.title,
      status: simulacro.status,
      expectedStudents,
      sheetsReceived: sheetsForSim.length,
      pendingReview,
      duplicates,
      invalid
    };
  });

  const totals = rows.reduce((acc, item) => ({
    expected: acc.expected + item.expectedStudents,
    received: acc.received + item.sheetsReceived,
    pending: acc.pending + item.pendingReview,
    duplicates: acc.duplicates + item.duplicates,
    invalid: acc.invalid + item.invalid
  }), { expected: 0, received: 0, pending: 0, duplicates: 0, invalid: 0 });

  const byCourse = courses.map((course) => {
    const related = rows.filter((row) => simulacros.find((sim) => String(sim._id) === String(row.simulacroId))?.courses?.some((id) => String(id) === String(course._id)));
    return {
      courseId: course._id,
      courseName: course.name,
      sheetsExpected: related.reduce((acc, row) => acc + row.expectedStudents, 0),
      sheetsReceived: related.reduce((acc, row) => acc + row.sheetsReceived, 0),
      pendingReview: related.reduce((acc, row) => acc + row.pendingReview, 0)
    };
  });

  const value = {
    totals,
    rows,
    byCourse,
    duplicateRate: totals.received ? Number((totals.duplicates / totals.received).toFixed(4)) : 0
  };

  governanceStatsCache.set(cacheKey, { createdAt: now, value });
  return value;
};

const computeInstitutionMetricsSnapshot = async ({ institutionId, institutionFilter }) => {
  const students = await User.find({ ...institutionFilter, role: 'estudiante', deletedAt: null })
    .select('_id')
    .lean();
  const studentIds = students.map((item) => item._id);
  if (!studentIds.length) {
    return InstitutionMetrics.findOneAndUpdate(
      { institutionId, date: new Date(new Date().toISOString().slice(0, 10)) },
      {
        $set: {
          metrics: {
            thetaDistribution: [],
            competencyBreakdown: [],
            riskCognitiveIndex: 0,
            crossCourseComparison: [],
            teacherPerformance: []
          }
        }
      },
      { upsert: true, new: true }
    ).lean();
  }

  const [progresses, courses] = await Promise.all([
    StudentProgress.find({ student: { $in: studentIds } })
      .select('student currentTheta competencies')
      .lean(),
    Course.find({ ...institutionFilter, deletedAt: null })
      .select('_id name teacher students')
      .lean()
  ]);

  const thetaDistribution = progresses.map((item) => Number(item.currentTheta || 0));
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

  const progressMap = new Map(progresses.map((item) => [String(item.student), Number(item.currentTheta || 0)]));
  const crossCourseComparison = courses.map((course) => {
    const values = (course.students || []).map((id) => progressMap.get(String(id))).filter((v) => Number.isFinite(v));
    const avgTheta = values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0;
    const riskStudents = values.filter((v) => v < 0.4).length;
    return { courseId: course._id, avgTheta, riskStudents };
  });

  const teacherMap = new Map();
  crossCourseComparison.forEach((courseRow, idx) => {
    const teacherId = String(courses[idx].teacher);
    if (!teacherMap.has(teacherId)) teacherMap.set(teacherId, { totalTheta: 0, courses: 0, atRisk: 0 });
    const row = teacherMap.get(teacherId);
    row.totalTheta += courseRow.avgTheta;
    row.courses += 1;
    row.atRisk += courseRow.riskStudents;
  });
  const teacherPerformance = [...teacherMap.entries()].map(([teacherId, value]) => ({
    teacherId: toObjectId(teacherId),
    avgTheta: Number((value.totalTheta / Math.max(1, value.courses)).toFixed(2)),
    atRiskStudents: value.atRisk
  }));

  const riskCognitiveIndex = progresses.length
    ? Number((progresses.filter((item) => Number(item.currentTheta || 0) < 0.4).length / progresses.length).toFixed(4))
    : 0;

  const date = new Date(new Date().toISOString().slice(0, 10));
  return InstitutionMetrics.findOneAndUpdate(
    { institutionId, date },
    {
      $set: {
        metrics: {
          thetaDistribution,
          competencyBreakdown,
          riskCognitiveIndex,
          crossCourseComparison,
          teacherPerformance
        }
      }
    },
    { upsert: true, new: true }
  ).lean();
};

const getInstitutionMetrics = async ({ institutionId, institutionFilter, forceRefresh = false }) => {
  if (forceRefresh) {
    return computeInstitutionMetricsSnapshot({ institutionId, institutionFilter });
  }
  const latest = await InstitutionMetrics.findOne({ institutionId }).sort({ date: -1 }).lean();
  if (latest) return latest;
  return computeInstitutionMetricsSnapshot({ institutionId, institutionFilter });
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
