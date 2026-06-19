const ApiError = require('../utils/ApiError');
const prisma = require('../config/prisma');

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

const thetaToScore500 = (theta = 0) => Math.max(0, Math.min(500, Math.round(250 + Number(theta || 0) * 85)));
const thetaToScore100 = (theta = 0) => Math.max(0, Math.min(100, Math.round(50 + Number(theta || 0) * 15)));
const thetaToPercentile = (theta = 0) => Math.max(1, Math.min(99, Math.round(50 + Number(theta || 0) * 18)));

const normalizeAreaName = (raw) => {
  const key = String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

// Returns courses the student is enrolled in, scoped to their school (multi-tenant safe)
const getStudentCourses = async ({ studentId, schoolId }) => {
  const studentRecord = await prisma.student.findUnique({ where: { userId: studentId } });
  if (!studentRecord) return [];

  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      studentId: studentRecord.id,
      course: { schoolId, status: 'active' }
    },
    include: { course: { select: { id: true, name: true, grade: true } } }
  });

  return enrollments.map((e) => e.course);
};

// Scoped to schoolId — percentile comparison only against students in the same school (multi-tenant fix)
const getComparisons = async ({ studentId, schoolId, courseIds = [] }) => {
  const progress = await prisma.studentProgress.findUnique({
    where: { studentId },
    select: { globalScore: true }
  });

  const schoolStudents = await prisma.user.findMany({
    where: { role: 'estudiante', schoolId },
    select: { id: true }
  });

  const institutionProgress = await prisma.studentProgress.findMany({
    where: { studentId: { in: schoolStudents.map((u) => u.id) } },
    select: { globalScore: true }
  });

  const institutionAvg = institutionProgress.length
    ? Math.round(institutionProgress.reduce((sum, item) => sum + Number(item.globalScore || 0), 0) / institutionProgress.length)
    : Number(progress?.globalScore || 0);

  let courseAvg = Number(progress?.globalScore || 0);
  if (courseIds.length) {
    const firstCourse = await prisma.course.findUnique({
      where: { id: courseIds[0] },
      include: { enrollments: { include: { student: { select: { userId: true } } } } }
    });
    if (firstCourse) {
      const courseStudentIds = firstCourse.enrollments.map((e) => e.student.userId);
      const courseProgress = await prisma.studentProgress.findMany({
        where: { studentId: { in: courseStudentIds } },
        select: { globalScore: true }
      });
      if (courseProgress.length) {
        courseAvg = Math.round(courseProgress.reduce((sum, item) => sum + Number(item.globalScore || 0), 0) / courseProgress.length);
      }
    }
  }

  return { courseAvg, institutionAvg };
};

const mapPhysicalStatusLabel = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'published': return 'publicado';
    case 'reviewing':
    case 'review': return 'en revision';
    case 'archived':
    case 'closed': return 'cerrado';
    default: return 'pendiente ocr';
  }
};

const getStudentOverview = async ({ studentId, schoolId }) => {
  const [progress, courses] = await Promise.all([
    prisma.studentProgress.findUnique({
      where: { studentId },
      include: {
        competencies: true,
        thetaHistory: { orderBy: { recordedAt: 'asc' } }
      }
    }),
    getStudentCourses({ studentId, schoolId })
  ]);

  const available = await prisma.simulacro.findMany({
    where: { schoolId, estado: 'publicado' },
    select: {
      id: true, title: true, description: true, fechaPublicacion: true,
      createdAt: true, globalTimeLimit: true,
      modules: { include: { questions: { select: { id: true } } } }
    },
    orderBy: [{ fechaPublicacion: 'desc' }, { createdAt: 'desc' }],
    take: 1
  });

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weeklySeries = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    weeklySeries.push({ date: day.toISOString(), theta: null });
  }

  const historial = progress?.thetaHistory || [];
  historial.forEach((item) => {
    const date = toDateValue(item.recordedAt);
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

  const weakestCompetency = progress?.competencies?.length
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

  const [latestVirtual, latestPhysical] = await Promise.all([
    prisma.simulacroResult.findMany({
      where: { studentId, status: 'submitted' },
      include: { simulacro: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 3
    }),
    prisma.evaluation.findMany({
      where: { studentId, evaluationType: 'physical', status: 'completed' },
      include: { physicalSimulacro: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 3
    })
  ]);

  const latestResults = [
    ...latestVirtual.map((item) => ({
      type: 'virtual',
      title: item.simulacro?.title || 'Simulacro virtual',
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
      trend: { label: trendLabel, delta: trendDelta }
    },
    nextSimulacro: available[0]
      ? {
        id: available[0].id,
        title: available[0].title,
        description: available[0].description || '',
        date: available[0].fechaPublicacion || available[0].createdAt,
        questionCount: (available[0].modules || []).reduce((sum, m) => sum + (m.questions?.length || 0), 0),
        duration: available[0].globalTimeLimit || null,
        type: 'virtual'
      }
      : null,
    weeklyProgress: weeklySeries,
    objective,
    latestResults,
    courses: courses.map((c) => ({ id: c.id, name: c.name, grade: c.grade }))
  };
};

const getStudentSimulacros = async ({ studentId, schoolId, status = 'available', query = {} }) => {
  const requested = ['available', 'inProgress', 'completed'].includes(status) ? status : 'available';
  const { page, limit, skip } = parsePagination(query);

  const [attempts, courses] = await Promise.all([
    prisma.simulacroResult.findMany({
      where: { studentId },
      select: { simulacroId: true, status: true, updatedAt: true, createdAt: true, overallTheta: true, percentile: true, id: true },
      orderBy: { updatedAt: 'desc' }
    }),
    getStudentCourses({ studentId, schoolId })
  ]);

  const latestBySimulacro = new Map();
  attempts.forEach((item) => {
    if (!latestBySimulacro.has(item.simulacroId)) latestBySimulacro.set(item.simulacroId, item);
  });

  const allVirtual = await prisma.simulacro.findMany({
    where: { schoolId, estado: 'publicado' },
    include: { modules: { include: { questions: { select: { id: true } } } } },
    orderBy: [{ fechaPublicacion: 'desc' }, { createdAt: 'desc' }]
  });

  const bucketed = { available: [], inProgress: [], completed: [] };

  allVirtual.forEach((simulacro) => {
    const attempt = latestBySimulacro.get(simulacro.id);
    const base = {
      id: simulacro.id,
      title: simulacro.title,
      description: simulacro.description || '',
      questionCount: (simulacro.modules || []).reduce((sum, m) => sum + (m.questions?.length || 0), 0),
      duration: simulacro.globalTimeLimit,
      type: 'virtual',
      strictMode: Boolean(simulacro.strictMode),
      date: simulacro.fechaPublicacion || simulacro.createdAt,
      attemptId: attempt?.id || null
    };

    if (!attempt) { bucketed.available.push(base); return; }
    if (attempt.status === 'in_progress') {
      bucketed.inProgress.push({ ...base, lastActivity: attempt.updatedAt || attempt.createdAt });
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

  const courseIds = courses.map((c) => c.id);

  // Physical simulacros for enrolled courses — read-only display (no legacy SimulacroPhysical)
  const physicalSimulacros = courseIds.length
    ? await prisma.physicalSimulacro.findMany({
        where: {
          schoolId,
          courses: { some: { id: { in: courseIds } } }
        },
        include: { courses: { select: { name: true, grade: true } } },
        orderBy: { date: 'desc' }
      })
    : [];

  const physicalReadOnly = physicalSimulacros.map((item) => ({
    id: item.id,
    title: item.title,
    date: item.date,
    type: 'physical',
    source: 'v2',
    readOnly: true,
    status: item.status,
    statusLabel: mapPhysicalStatusLabel(item.status),
    questionCount: Number(item.totalQuestions || 0),
    courses: (item.courses || []).map((c) => c.name)
  }));

  return {
    status: requested,
    items,
    physicalReadOnly,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  };
};

const buildUnifiedResultData = async ({ studentId, schoolId, scope = 'all' }) => {
  const includeVirtual = scope === 'all' || scope === 'virtual';
  const includePhysical = scope === 'all' || scope === 'physical';

  const [progress, courses, virtualResults, physicalResults] = await Promise.all([
    prisma.studentProgress.findUnique({ where: { studentId } }),
    getStudentCourses({ studentId, schoolId }),
    includeVirtual
      ? prisma.simulacroResult.findMany({
          where: { studentId, status: 'submitted' },
          include: {
            simulacro: { select: { title: true } },
            moduleThetas: true
          },
          orderBy: { updatedAt: 'asc' }
        })
      : Promise.resolve([]),
    includePhysical
      ? prisma.evaluation.findMany({
          where: { studentId, evaluationType: 'physical', status: 'completed' },
          include: { physicalSimulacro: { select: { title: true } } },
          orderBy: { updatedAt: 'asc' }
        })
      : Promise.resolve([])
  ]);

  const areaMap = new Map(AREA_ORDER.map((name) => [name, []]));
  const timeline = [];

  virtualResults.forEach((item) => {
    const date = item.updatedAt || item.createdAt;
    const score = thetaToScore500(item.overallTheta || 0);
    const percentile = Number(item.percentile || thetaToPercentile(item.overallTheta || 0));

    timeline.push({
      date, type: 'virtual', title: item.simulacro?.title || 'Simulacro virtual',
      score, theta: Number(item.overallTheta || 0), percentile
    });

    (item.moduleThetas || []).forEach((mt) => {
      const area = normalizeAreaName(mt.moduleName) || mt.moduleName;
      if (!areaMap.has(area)) areaMap.set(area, []);
      areaMap.get(area).push({
        date, type: 'virtual',
        score: thetaToScore100(mt.theta || 0),
        theta: Number(mt.theta || 0),
        percentile: thetaToPercentile(mt.theta || 0)
      });
    });
  });

  physicalResults.forEach((item) => {
    const date = item.updatedAt || item.createdAt;
    const score = Number(item.globalScore || thetaToScore500(item.theta || 0));
    const percentile = Number(item.percentile || thetaToPercentile(item.theta || 0));

    timeline.push({
      date, type: 'physical', title: item.physicalSimulacro?.title || 'Simulacro fisico',
      score, theta: Number(item.theta || 0), percentile
    });

    const breakdown = item.physicalCompetencyBreakdown || [];
    breakdown.forEach((row) => {
      const area = normalizeAreaName(row.competencia) || normalizeAreaName(row.area) || 'Ciencias Naturales';
      if (!areaMap.has(area)) areaMap.set(area, []);
      const ratio = row.total ? Number(row.correct || 0) / Number(row.total) : 0;
      areaMap.get(area).push({ date, type: 'physical', score: Math.round(ratio * 100), theta: Number(item.theta || 0), percentile });
    });
  });

  const comparisons = await getComparisons({
    studentId,
    schoolId,
    courseIds: courses.map((c) => c.id)
  });

  const sortedTimeline = timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
  const latest = sortedTimeline[sortedTimeline.length - 1];

  const areas = AREA_ORDER.map((areaName) => {
    const records = areaMap.get(areaName) || [];
    if (!records.length) {
      return { name: areaName, score0_100: null, percentile: null, level: 'Sin datos', theta: null, strengths: [], weaknesses: [], recommendations: [], timeline: [] };
    }

    const avgScore = Number((records.reduce((sum, item) => sum + Number(item.score || 0), 0) / records.length).toFixed(1));
    const avgTheta = Number((records.reduce((sum, item) => sum + Number(item.theta || 0), 0) / records.length).toFixed(3));
    const avgPercentile = Math.round(records.reduce((sum, item) => sum + Number(item.percentile || 0), 0) / records.length);

    return {
      name: areaName,
      score0_100: avgScore,
      percentile: avgPercentile,
      level: levelFromScore(avgScore),
      theta: avgTheta,
      strengths: avgScore >= 75 ? [`Tu punto fuerte: ${areaName} se mantiene por encima del promedio esperado.`] : [],
      weaknesses: avgScore < 60 ? [`Debes reforzar ${areaName}. Tu rendimiento actual esta por debajo del objetivo institucional.`] : [],
      recommendations: avgScore < 60
        ? [`Practica semanal enfocada en ${areaName}.`, 'Resuelve preguntas de dificultad media-alta y revisa retroalimentacion.']
        : [`Vas bien en ${areaName}. Mantener practica de consolidacion.`],
      timeline: records.map((item) => ({ date: item.date, type: item.type, score: item.score, theta: item.theta }))
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

const getStudentResults = async ({ studentId, schoolId, scope = 'all' }) => {
  if (!['all', 'virtual', 'physical'].includes(scope)) {
    throw buildError(400, 'ValidationError', ['scope invalido']);
  }
  return buildUnifiedResultData({ studentId, schoolId, scope });
};

const getStudentProgress = async ({ studentId, schoolId }) => {
  const [progress, results] = await Promise.all([
    prisma.studentProgress.findUnique({
      where: { studentId },
      include: {
        competencies: true,
        thetaHistory: { orderBy: { recordedAt: 'asc' } }
      }
    }),
    buildUnifiedResultData({ studentId, schoolId, scope: 'all' })
  ]);

  const thetaSeries = (progress?.thetaHistory || [])
    .map((item) => ({
      date: item.recordedAt,
      theta: Number(item.theta || 0),
      score: Number(thetaToScore500(item.theta || 0))
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

  const weakestTheta = competencies.length ? Math.min(...competencies.map((item) => Number(item.theta || 0))) : 0;
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

// Ranking scoped to schoolId — prevents cross-school comparisons (multi-tenant fix)
const getStudentRanking = async ({ studentId, schoolId }) => {
  const courses = await getStudentCourses({ studentId, schoolId });
  if (!courses.length) return { items: [], position: null, total: 0 };

  const firstCourse = await prisma.course.findUnique({
    where: { id: courses[0].id },
    include: { enrollments: { include: { student: { select: { userId: true } } } } }
  });

  const courseStudentIds = (firstCourse?.enrollments || []).map((e) => e.student.userId);

  const progresses = await prisma.studentProgress.findMany({
    where: { studentId: { in: courseStudentIds }, schoolId },
    select: { studentId: true, currentTheta: true, globalScore: true, percentile: true },
    orderBy: { currentTheta: 'desc' }
  });

  const position = progresses.findIndex((item) => item.studentId === studentId);

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
