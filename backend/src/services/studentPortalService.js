const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const Course = require('../models/Course');
const User = require('../models/User');
const Simulacro = require('../models/Simulacro');
const SimulacroResult = require('../models/SimulacroResult');
const StudentProgress = require('../models/StudentProgress');
const Evaluation = require('../models/Evaluation');
const PhysicalSimulacro = require('../models/PhysicalSimulacro');
const SimulacroPhysical = require('../models/SimulacroPhysical');

const AREA_ORDER = ['Lectura Critica', 'Matematicas', 'Sociales', 'Ciencias Naturales', 'Ingles'];
const AREA_ALIAS = {
  lectura: 'Lectura Critica',
  lecturacritica: 'Lectura Critica',
  lectura_critica: 'Lectura Critica',
  matematicas: 'Matematicas',
  matematica: 'Matematicas',
  sociales: 'Sociales',
  ciencias: 'Ciencias Naturales',
  cienciasnaturales: 'Ciencias Naturales',
  ingles: 'Ingles'
};

const buildError = (statusCode, message, errors = []) => new ApiError(statusCode, message, errors);

const toDateValue = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const thetaToScore500 = (theta = 0) => {
  const value = 250 + Number(theta || 0) * 85;
  return Math.max(0, Math.min(500, Math.round(value)));
};

const thetaToScore100 = (theta = 0) => {
  const value = 50 + Number(theta || 0) * 15;
  return Math.max(0, Math.min(100, Math.round(value)));
};

const thetaToPercentile = (theta = 0) => {
  const value = 50 + Number(theta || 0) * 18;
  return Math.max(1, Math.min(99, Math.round(value)));
};

const normalizeAreaName = (raw) => {
  const key = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  return AREA_ALIAS[key] || null;
};

const levelFromScore = (score) => {
  if (score === null || score === undefined) return 'Sin datos';
  if (score >= 80) return 'Alto';
  if (score >= 60) return 'Medio';
  return 'Basico';
};

const parsePagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit || '20'), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const scopedFilter = (baseFilter, institutionId) => ({
  $and: [
    baseFilter,
    {
      $or: [
        { institutionId },
        { institutionId: { $exists: false } }
      ]
    }
  ]
});

const getStudentCourses = async ({ studentId, institutionId }) => Course.find(
  scopedFilter({ students: studentId, deletedAt: null, status: 'active' }, institutionId)
)
  .select('_id name grade')
  .lean();

const getComparisons = async ({ studentId, institutionId, courseIds = [] }) => {
  const studentProgress = await StudentProgress.findOne({ student: studentId })
    .select('globalScore')
    .lean();

  const studentUsers = await User.find({
    role: 'estudiante',
    deletedAt: null,
    $or: [{ institutionId }, { institutionId: { $exists: false } }]
  })
    .select('_id')
    .lean();

  const institutionProgress = await StudentProgress.find({
    student: { $in: studentUsers.map((item) => item._id) }
  })
    .select('globalScore')
    .lean();

  const institutionAvg = institutionProgress.length
    ? Math.round(institutionProgress.reduce((sum, item) => sum + Number(item.globalScore || 0), 0) / institutionProgress.length)
    : Number(studentProgress?.globalScore || 0);

  let courseAvg = Number(studentProgress?.globalScore || 0);
  if (courseIds.length) {
    const course = await Course.findOne({ _id: courseIds[0] }).select('students').lean();
    const courseProgress = await StudentProgress.find({
      student: { $in: course?.students || [] }
    })
      .select('globalScore')
      .lean();

    if (courseProgress.length) {
      courseAvg = Math.round(courseProgress.reduce((sum, item) => sum + Number(item.globalScore || 0), 0) / courseProgress.length);
    }
  }

  return { courseAvg, institutionAvg };
};

const mapPhysicalStatusLabel = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'published':
      return 'publicado';
    case 'reviewing':
    case 'review':
      return 'en revision';
    case 'archived':
    case 'closed':
      return 'cerrado';
    default:
      return 'pendiente ocr';
  }
};

const getStudentOverview = async ({ studentId, institutionId }) => {
  const [progress, courses] = await Promise.all([
    StudentProgress.findOne({ student: studentId }).lean(),
    getStudentCourses({ studentId, institutionId })
  ]);

  const { page, limit } = parsePagination({ page: 1, limit: 1 });
  const available = await Simulacro.find(scopedFilter({ estado: 'publicado' }, institutionId))
    .select('title description fechaPublicacion createdAt globalTimeLimit modules')
    .sort({ fechaPublicacion: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weeklySeries = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    weeklySeries.push({
      date: day.toISOString(),
      theta: null
    });
  }

  const historial = Array.isArray(progress?.historialTheta) ? progress.historialTheta : [];
  historial.forEach((item) => {
    const date = toDateValue(item.date);
    if (!date || date < weekStart) return;
    const dayKey = date.toISOString().slice(0, 10);
    const target = weeklySeries.find((slot) => slot.date.slice(0, 10) === dayKey);
    if (target) target.theta = Number(item.theta || 0);
  });

  let previousTheta = null;
  let currentTheta = Number(progress?.currentTheta || 0);
  if (historial.length >= 2) {
    previousTheta = Number(historial[historial.length - 2]?.theta || 0);
    currentTheta = Number(historial[historial.length - 1]?.theta || currentTheta);
  }

  const trendDelta = previousTheta === null ? 0 : Number((currentTheta - previousTheta).toFixed(3));
  const trendLabel = trendDelta > 0.05 ? 'subiendo' : trendDelta < -0.05 ? 'bajando' : 'estable';

  const weakestCompetency = Array.isArray(progress?.competencies) && progress.competencies.length
    ? [...progress.competencies].sort((a, b) => Number(a.theta || 0) - Number(b.theta || 0))[0]
    : null;

  const objective = weakestCompetency
    ? {
      title: `Siguiente objetivo: reforzar ${normalizeAreaName(weakestCompetency.area) || weakestCompetency.area}`,
      description: 'Practica 15-20 minutos diarios en esta area para subir tu theta semanal.',
      area: normalizeAreaName(weakestCompetency.area) || weakestCompetency.area,
      theta: Number(weakestCompetency.theta || 0)
    }
    : {
      title: 'Siguiente objetivo: presentar un simulacro',
      description: 'Aun no hay datos suficientes. Completa un simulacro para generar recomendaciones.',
      area: null,
      theta: null
    };

  const latestVirtual = await SimulacroResult.find({ studentId, status: 'submitted' })
    .select('overallTheta percentile updatedAt simulacroId')
    .populate('simulacroId', 'title')
    .sort({ updatedAt: -1 })
    .limit(3)
    .lean();

  const latestPhysical = await Evaluation.find({ student: studentId, evaluationType: 'physical', status: 'completed' })
    .select('theta percentile globalScore updatedAt physicalSimulacro')
    .populate('physicalSimulacro', 'title')
    .sort({ updatedAt: -1 })
    .limit(3)
    .lean();

  const latestResults = [
    ...latestVirtual.map((item) => ({
      type: 'virtual',
      title: item.simulacroId?.title || 'Simulacro virtual',
      theta: Number(item.overallTheta || 0),
      percentile: Number(item.percentile || thetaToPercentile(item.overallTheta || 0)),
      score: thetaToScore500(item.overallTheta || 0),
      date: item.updatedAt
    })),
    ...latestPhysical.map((item) => ({
      type: 'physical',
      title: item.physicalSimulacro?.title || 'Simulacro fisico',
      theta: Number(item.theta || 0),
      percentile: Number(item.percentile || thetaToPercentile(item.theta || 0)),
      score: Number(item.globalScore || thetaToScore500(item.theta || 0)),
      date: item.updatedAt
    }))
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  return {
    kpis: {
      thetaActual: Number(progress?.currentTheta || 0),
      percentil: Number(progress?.percentile || 50),
      scoreGlobal: Number(progress?.globalScore || 0),
      simulacrosCompletados: Number(progress?.simulacrosCompletados || 0),
      trend: {
        label: trendLabel,
        delta: trendDelta
      }
    },
    nextSimulacro: available[0]
      ? {
        id: available[0]._id,
        title: available[0].title,
        description: available[0].description || '',
        date: available[0].fechaPublicacion || available[0].createdAt,
        questionCount: (available[0].modules || []).reduce((sum, moduleItem) => sum + (moduleItem.questions?.length || 0), 0),
        duration: available[0].globalTimeLimit || null,
        type: 'virtual'
      }
      : null,
    weeklyProgress: weeklySeries,
    objective,
    latestResults,
    courses: courses.map((course) => ({ id: course._id, name: course.name, grade: course.grade }))
  };
};

const getStudentSimulacros = async ({ studentId, institutionId, status = 'available', query = {} }) => {
  const requested = ['available', 'inProgress', 'completed'].includes(status) ? status : 'available';
  const { page, limit, skip } = parsePagination(query);

  const [attempts, courses] = await Promise.all([
    SimulacroResult.find({ studentId })
      .select('simulacroId status updatedAt createdAt overallTheta percentile')
      .sort({ updatedAt: -1 })
      .lean(),
    getStudentCourses({ studentId, institutionId })
  ]);

  const latestBySimulacro = new Map();
  attempts.forEach((item) => {
    const key = String(item.simulacroId);
    if (!latestBySimulacro.has(key)) latestBySimulacro.set(key, item);
  });

  const allVirtual = await Simulacro.find(scopedFilter({ estado: 'publicado' }, institutionId))
    .select('title description modules globalTimeLimit strictMode fechaPublicacion createdAt')
    .sort({ fechaPublicacion: -1, createdAt: -1 })
    .lean();

  const bucketed = {
    available: [],
    inProgress: [],
    completed: []
  };

  allVirtual.forEach((simulacro) => {
    const key = String(simulacro._id);
    const attempt = latestBySimulacro.get(key);
    const base = {
      id: simulacro._id,
      title: simulacro.title,
      description: simulacro.description || '',
      questionCount: (simulacro.modules || []).reduce((sum, moduleItem) => sum + (moduleItem.questions?.length || 0), 0),
      duration: simulacro.globalTimeLimit,
      type: 'virtual',
      strictMode: Boolean(simulacro.strictMode),
      date: simulacro.fechaPublicacion || simulacro.createdAt,
      attemptId: attempt?._id || null
    };

    if (!attempt) {
      bucketed.available.push(base);
      return;
    }

    if (attempt.status === 'in_progress') {
      bucketed.inProgress.push({
        ...base,
        lastActivity: attempt.updatedAt || attempt.createdAt
      });
      return;
    }

    bucketed.completed.push({
      ...base,
      score: thetaToScore500(attempt.overallTheta || 0),
      theta: Number(attempt.overallTheta || 0),
      percentile: Number(attempt.percentile || thetaToPercentile(attempt.overallTheta || 0)),
      completedAt: attempt.updatedAt || attempt.createdAt
    });
  });

  const selected = bucketed[requested];
  const total = selected.length;
  const items = selected.slice(skip, skip + limit);

  const courseIds = courses.map((item) => item._id);

  const [physicalV2, physicalV1] = await Promise.all([
    PhysicalSimulacro.find(scopedFilter({ courses: { $in: courseIds } }, institutionId))
      .select('title date status courses totalQuestions')
      .populate('courses', 'name grade')
      .sort({ date: -1 })
      .lean(),
    SimulacroPhysical.find({ assignedCourses: { $in: courseIds } })
      .select('title date status assignedCourses questionCount')
      .populate('assignedCourses', 'name grade')
      .sort({ date: -1 })
      .lean()
  ]);

  const physicalReadOnly = [
    ...physicalV2.map((item) => ({
      id: item._id,
      title: item.title,
      date: item.date,
      type: 'physical',
      source: 'v2',
      readOnly: true,
      status: item.status,
      statusLabel: mapPhysicalStatusLabel(item.status),
      questionCount: Number(item.totalQuestions || 0),
      courses: (item.courses || []).map((course) => course.name)
    })),
    ...physicalV1.map((item) => ({
      id: item._id,
      title: item.title,
      date: item.date,
      type: 'physical',
      source: 'v1',
      readOnly: true,
      status: item.status,
      statusLabel: mapPhysicalStatusLabel(item.status),
      questionCount: Number(item.questionCount || 0),
      courses: (item.assignedCourses || []).map((course) => course.name)
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return {
    status: requested,
    items,
    physicalReadOnly,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  };
};

const buildUnifiedResultData = async ({ studentId, institutionId, scope = 'all' }) => {
  const includeVirtual = scope === 'all' || scope === 'virtual';
  const includePhysical = scope === 'all' || scope === 'physical';

  const [progress, courses, virtualResults, physicalResults] = await Promise.all([
    StudentProgress.findOne({ student: studentId }).lean(),
    getStudentCourses({ studentId, institutionId }),
    includeVirtual
      ? SimulacroResult.find({ studentId, status: 'submitted' })
        .select('simulacroId overallTheta percentile thetasByModule updatedAt createdAt')
        .populate('simulacroId', 'title')
        .sort({ updatedAt: 1, createdAt: 1 })
        .lean()
      : Promise.resolve([]),
    includePhysical
      ? Evaluation.find({ student: studentId, evaluationType: 'physical', status: 'completed' })
        .select('theta percentile globalScore physicalMeta updatedAt createdAt physicalSimulacro')
        .populate('physicalSimulacro', 'title')
        .sort({ updatedAt: 1, createdAt: 1 })
        .lean()
      : Promise.resolve([])
  ]);

  const areaMap = new Map(AREA_ORDER.map((name) => [name, []]));
  const timeline = [];

  virtualResults.forEach((item) => {
    const date = item.updatedAt || item.createdAt;
    const score = thetaToScore500(item.overallTheta || 0);
    const percentile = Number(item.percentile || thetaToPercentile(item.overallTheta || 0));

    timeline.push({
      date,
      type: 'virtual',
      title: item.simulacroId?.title || 'Simulacro virtual',
      score,
      theta: Number(item.overallTheta || 0),
      percentile
    });

    (item.thetasByModule || []).forEach((moduleTheta) => {
      const area = normalizeAreaName(moduleTheta.moduleName) || moduleTheta.moduleName;
      if (!areaMap.has(area)) areaMap.set(area, []);
      areaMap.get(area).push({
        date,
        type: 'virtual',
        score: thetaToScore100(moduleTheta.theta || 0),
        theta: Number(moduleTheta.theta || 0),
        percentile: thetaToPercentile(moduleTheta.theta || 0)
      });
    });
  });

  physicalResults.forEach((item) => {
    const date = item.updatedAt || item.createdAt;
    const score = Number(item.globalScore || thetaToScore500(item.theta || 0));
    const percentile = Number(item.percentile || thetaToPercentile(item.theta || 0));

    timeline.push({
      date,
      type: 'physical',
      title: item.physicalSimulacro?.title || 'Simulacro fisico',
      score,
      theta: Number(item.theta || 0),
      percentile
    });

    const breakdown = item.physicalMeta?.competencyBreakdown || [];
    breakdown.forEach((row) => {
      const area = normalizeAreaName(row.competencia) || normalizeAreaName(row.area) || 'Ciencias Naturales';
      if (!areaMap.has(area)) areaMap.set(area, []);
      const ratio = row.total ? Number(row.correct || 0) / Number(row.total) : 0;
      areaMap.get(area).push({
        date,
        type: 'physical',
        score: Math.round(ratio * 100),
        theta: Number(item.theta || 0),
        percentile
      });
    });
  });

  const comparisons = await getComparisons({
    studentId,
    institutionId,
    courseIds: courses.map((item) => item._id)
  });

  const sortedTimeline = timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
  const latest = sortedTimeline[sortedTimeline.length - 1];

  const areas = AREA_ORDER.map((areaName) => {
    const records = areaMap.get(areaName) || [];
    if (!records.length) {
      return {
        name: areaName,
        score0_100: null,
        percentile: null,
        level: 'Sin datos',
        theta: null,
        strengths: [],
        weaknesses: [],
        recommendations: [],
        timeline: []
      };
    }

    const avgScore = Number((records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length).toFixed(1));
    const avgTheta = Number((records.reduce((sum, item) => sum + Number(item.theta || 0), 0) / records.length).toFixed(3));
    const avgPercentile = Math.round(records.reduce((sum, item) => sum + Number(item.percentile || 0), 0) / records.length);

    const strengths = avgScore >= 75
      ? [`Tu punto fuerte: ${areaName} se mantiene por encima del promedio esperado.`]
      : [];

    const weaknesses = avgScore < 60
      ? [`Debes reforzar ${areaName}. Tu rendimiento actual esta por debajo del objetivo institucional.`]
      : [];

    const recommendations = avgScore < 60
      ? [
          `Practica semanal enfocada en ${areaName}.`,
          'Resuelve preguntas de dificultad media-alta y revisa retroalimentacion.'
        ]
      : [
          `Vas bien en ${areaName}. Mantener practica de consolidacion.`
        ];

    return {
      name: areaName,
      score0_100: avgScore,
      percentile: avgPercentile,
      level: levelFromScore(avgScore),
      theta: avgTheta,
      strengths,
      weaknesses,
      recommendations,
      timeline: records.map((item) => ({
        date: item.date,
        type: item.type,
        score: item.score,
        theta: item.theta
      }))
    };
  });

  return {
    globalScore0_500: Number(latest?.score || progress?.globalScore || 0),
    percentile: Number(latest?.percentile || progress?.percentile || 50),
    comparisons,
    areas,
    timeline: sortedTimeline
  };
};

const getStudentResults = async ({ studentId, institutionId, scope = 'all' }) => {
  if (!['all', 'virtual', 'physical'].includes(scope)) {
    throw buildError(400, 'ValidationError', ['scope invalido']);
  }

  return buildUnifiedResultData({ studentId, institutionId, scope });
};

const getStudentProgress = async ({ studentId, institutionId }) => {
  const [progress, results] = await Promise.all([
    StudentProgress.findOne({ student: studentId }).lean(),
    buildUnifiedResultData({ studentId, institutionId, scope: 'all' })
  ]);

  const thetaSeries = (progress?.historialTheta || [])
    .map((item) => ({
      date: item.date,
      theta: Number(item.theta || 0),
      score: Number(item.globalScore || thetaToScore500(item.theta || 0))
    }))
    .filter((item) => toDateValue(item.date))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const competencies = (progress?.competencies || []).map((item) => ({
    area: normalizeAreaName(item.area) || item.area,
    theta: Number(item.theta || 0),
    score0_100: thetaToScore100(item.theta || 0),
    questionsAnswered: Number(item.questionsAnswered || 0),
    lastUpdated: item.lastUpdated
  }));

  const weakestTheta = competencies.length
    ? Math.min(...competencies.map((item) => Number(item.theta || 0)))
    : 0;

  const trend = thetaSeries.length >= 2
    ? Number((thetaSeries[thetaSeries.length - 1].theta - thetaSeries[thetaSeries.length - 2].theta).toFixed(3))
    : 0;

  const riskCognitive = weakestTheta < -0.5 || trend < -0.2;

  return {
    thetaSeries,
    competencies,
    risk: {
      riskCognitive,
      weakestTheta,
      trend,
      message: riskCognitive
        ? 'Riesgo cognitivo detectado: prioriza plan de estudio en areas debiles.'
        : 'Riesgo cognitivo bajo: mantienes una evolucion estable.'
    },
    timeline: results.timeline
  };
};

const getStudentRanking = async ({ studentId, institutionId }) => {
  const courses = await getStudentCourses({ studentId, institutionId });
  if (!courses.length) return { items: [], position: null, total: 0 };

  const course = await Course.findById(courses[0]._id).select('students').lean();
  const progresses = await StudentProgress.find({ student: { $in: course?.students || [] } })
    .select('student currentTheta globalScore percentile')
    .sort({ currentTheta: -1 })
    .lean();

  const position = progresses.findIndex((item) => String(item.student) === String(studentId));

  return {
    items: progresses,
    position: position >= 0 ? position + 1 : null,
    total: progresses.length
  };
};

module.exports = {
  getStudentOverview,
  getStudentSimulacros,
  getStudentResults,
  getStudentProgress,
  getStudentRanking
};
