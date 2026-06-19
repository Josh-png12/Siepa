const prisma = require('../config/prisma');

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeLabel = (value = '') => String(value || '').trim().toLowerCase();
const prettyLabel = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin definir';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getStudentProgressMap = async (studentUserIds) => {
  if (!studentUserIds.length) return new Map();

  const progresses = await prisma.studentProgress.findMany({
    where: { studentId: { in: studentUserIds } },
    include: {
      competencies: true,
      thetaHistory: { orderBy: { recordedAt: 'asc' }, take: 18 }
    }
  });

  return new Map(progresses.map((item) => [item.studentId, item]));
};

const getCourseAverageTheta = ({ studentUserIds, progressMap }) => {
  if (!studentUserIds.length) return 0;
  const values = studentUserIds
    .map((id) => Number(progressMap.get(id)?.currentTheta || 0))
    .filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  return Number((values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(2));
};

const buildCompetencyBreakdown = (progresses) => {
  const acc = new Map();

  progresses.forEach((progress) => {
    (progress.competencies || []).forEach((entry) => {
      const key = normalizeLabel(entry.area);
      if (!key) return;
      if (!acc.has(key)) acc.set(key, { totalTheta: 0, count: 0, totalQuestions: 0 });
      const row = acc.get(key);
      row.totalTheta += Number(entry.theta || 0);
      row.count += 1;
      row.totalQuestions += Number(entry.questionsAnswered || 0);
    });
  });

  return [...acc.entries()]
    .map(([key, value]) => ({
      competencyKey: key,
      competency: prettyLabel(key),
      avgTheta: Number((value.totalTheta / Math.max(1, value.count)).toFixed(2)),
      questionsAnswered: value.totalQuestions,
      coverage: value.count
    }))
    .sort((a, b) => a.avgTheta - b.avgTheta);
};

const buildThetaTrend = (progresses) => {
  const monthMap = new Map();

  progresses.forEach((progress) => {
    (progress.thetaHistory || []).slice(-18).forEach((entry) => {
      const date = new Date(entry.recordedAt);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key).push(Number(entry.theta || 0));
    });
  });

  const rows = [...monthMap.entries()]
    .map(([month, values]) => ({
      month,
      avgTheta: Number((values.reduce((acc, v) => acc + v, 0) / Math.max(1, values.length)).toFixed(2))
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-8);

  if (rows.length) return rows;

  const fallback = progresses.map((p) => Number(p.currentTheta || 0)).filter((v) => Number.isFinite(v));
  const now = new Date();
  return [{
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    avgTheta: Number((fallback.reduce((a, b) => a + b, 0) / Math.max(1, fallback.length)).toFixed(2))
  }];
};

const buildHeatmap = ({ students, progressMap, competencyKeys }) =>
  students.slice(0, 30).map((student) => {
    const progress = progressMap.get(student.id);
    const competencyMap = new Map(
      (progress?.competencies || []).map((entry) => [normalizeLabel(entry.area), Number(entry.theta || 0)])
    );
    return {
      studentId: student.id,
      name: student.name,
      values: competencyKeys.map((key) => ({
        competency: prettyLabel(key),
        theta: Number((competencyMap.get(key) || 0).toFixed(2))
      }))
    };
  });

const getTrendDelta = (thetaTrend) => {
  if (thetaTrend.length < 2) return 0;
  const latest = Number(thetaTrend[thetaTrend.length - 1]?.avgTheta || 0);
  const prev = Number(thetaTrend[thetaTrend.length - 2]?.avgTheta || 0);
  return Number((latest - prev).toFixed(2));
};

const getRiskStudents = ({ students, progressMap }) => {
  const now = Date.now();
  const list = [];

  students.forEach((student) => {
    const progress = progressMap.get(student.id);
    if (!progress) return;

    const latestTheta = Number(progress.currentTheta || 0);
    const history = (progress.thetaHistory || []).slice(-6);
    const trend = history.length >= 2
      ? Number(history[history.length - 1].theta || 0) - Number(history[0].theta || 0)
      : 0;
    const lastActivity = student.lastActivity ? new Date(student.lastActivity).getTime() : 0;
    const daysWithoutActivity = lastActivity ? (now - lastActivity) / (1000 * 60 * 60 * 24) : 999;

    let riskScore = 0;
    if (latestTheta < 0.2) riskScore += 2;
    else if (latestTheta < 0.5) riskScore += 1;
    if (trend < -0.15) riskScore += 1;
    if (daysWithoutActivity > 7) riskScore += 1;

    if (riskScore < 2) return;

    list.push({
      studentId: student.id,
      name: student.name,
      theta: Number(latestTheta.toFixed(2)),
      trend: Number(trend.toFixed(2)),
      daysWithoutActivity: Math.floor(daysWithoutActivity),
      riskScore,
      status: riskScore >= 3 ? 'alto' : 'medio'
    });
  });

  return list.sort((a, b) => b.riskScore - a.riskScore);
};

// schoolId filter prevents tag suggestions from mixing questions across tenants (multi-tenant fix)
const getSuggestedTags = async ({ weakestCompetencies, schoolId }) => {
  if (!weakestCompetencies.length) return [];

  const weakKeys = weakestCompetencies.map((item) => item.competencyKey);

  const groups = await prisma.question.groupBy({
    by: ['competencia'],
    where: {
      schoolId, // scoped to school
      area: { in: weakKeys }
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 6
  });

  return groups
    .filter((item) => item.competencia)
    .map((item) => ({ tag: item.competencia, availableQuestions: item._count.id }));
};

const getProjectedSaber11Score = (averageTheta) =>
  Math.round(clamp(250 + Number(averageTheta || 0) * 70, 0, 500));

const getTeacherCourses = async (teacherId, schoolId) =>
  prisma.course.findMany({
    where: { teacherId, schoolId, status: 'active' },
    include: {
      enrollments: {
        include: { student: { select: { userId: true } } }
      }
    }
  });

const ensureCourseOwnership = async (courseId, teacherId, schoolId) => {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, schoolId },
    include: {
      enrollments: {
        include: { student: { select: { userId: true } } }
      }
    }
  });
  if (!course) throw buildError('Curso no encontrado o no autorizado', 404);
  return course;
};

const getCourseStudents = async (studentUserIds) => {
  if (!studentUserIds.length) return [];
  return prisma.user.findMany({
    where: { id: { in: studentUserIds } },
    select: { id: true, name: true, email: true, lastActivity: true }
  });
};

const getCourseInsights = async ({ courseId, teacherId, schoolId }) => {
  const course = await ensureCourseOwnership(courseId, teacherId, schoolId);
  const studentUserIds = (course.enrollments || []).map((e) => e.student.userId);
  const students = await getCourseStudents(studentUserIds);
  const progressMap = await getStudentProgressMap(studentUserIds);
  const progresses = students.map((s) => progressMap.get(s.id)).filter(Boolean);

  const competencyBreakdown = buildCompetencyBreakdown(progresses);
  const thetaTrend = buildThetaTrend(progresses);
  const weakestCompetencies = competencyBreakdown.slice(0, 2);
  const atRiskStudents = getRiskStudents({ students, progressMap });
  const competencyKeys = competencyBreakdown.map((item) => item.competencyKey);
  const heatmap = buildHeatmap({ students, progressMap, competencyKeys });

  const teacherCourses = await getTeacherCourses(teacherId, schoolId);
  const allStudentUserIds = [...new Set(teacherCourses.flatMap((c) => (c.enrollments || []).map((e) => e.student.userId)))];
  const allProgressMap = await getStudentProgressMap(allStudentUserIds);
  const comparison = teacherCourses.map((c) => {
    const ids = (c.enrollments || []).map((e) => e.student.userId);
    return {
      courseId: c.id,
      courseName: c.name,
      avgTheta: getCourseAverageTheta({ studentUserIds: ids, progressMap: allProgressMap })
    };
  });
  comparison.sort((a, b) => b.avgTheta - a.avgTheta);

  const currentAvgTheta = getCourseAverageTheta({ studentUserIds, progressMap });
  const trendDelta = getTrendDelta(thetaTrend);
  const suggestedTags = await getSuggestedTags({ weakestCompetencies, schoolId });
  const projectedSaber11Score = getProjectedSaber11Score(currentAvgTheta);

  return {
    course: { id: course.id, name: course.name, grade: course.grade, year: course.year },
    metrics: {
      totalStudents: students.length,
      averageTheta: currentAvgTheta,
      weakestCompetency: weakestCompetencies[0]?.competency || 'Sin datos',
      atRiskStudents: atRiskStudents.length,
      projectedSaber11Score,
      trendDelta
    },
    charts: { competencyBreakdown, thetaTrend, comparison, heatmap },
    insights: {
      recommendedCompetencies: weakestCompetencies.map((item) => item.competency),
      suggestedQuestionTags: suggestedTags,
      alerts: [
        ...(trendDelta < -0.1
          ? [{ type: 'warning', title: 'Descenso de rendimiento', message: `El promedio theta del curso cayo ${Math.abs(trendDelta).toFixed(2)} puntos en el ultimo periodo.` }]
          : []),
        ...(atRiskStudents.length
          ? [{ type: 'danger', title: 'Estudiantes en riesgo', message: `${atRiskStudents.length} estudiantes requieren intervencion prioritaria.` }]
          : [])
      ],
      recommendedActions: [
        `Refuerza ${weakestCompetencies[0]?.competency || 'la competencia de menor desempeno'} con sesiones semanales.`,
        'Asigna preguntas calibradas con dificultad media para estabilizar el progreso.',
        'Realiza seguimiento quincenal a estudiantes con riesgo alto.'
      ]
    },
    atRiskStudents
  };
};

const getDashboardInsights = async ({ teacherId, schoolId }) => {
  const courses = await getTeacherCourses(teacherId, schoolId);
  if (!courses.length) {
    return {
      summary: { totalCourses: 0, overallAverageTheta: 0, projectedSaber11Score: 250, trendDelta: 0 },
      insights: { recommendedCompetencies: [], suggestedQuestionTags: [], alerts: [], recommendedActions: [] },
      topAtRiskCourses: []
    };
  }

  const allStudentUserIds = [...new Set(courses.flatMap((c) => (c.enrollments || []).map((e) => e.student.userId)))];
  const progressMap = await getStudentProgressMap(allStudentUserIds);
  const students = await getCourseStudents(allStudentUserIds);
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const courseMetrics = courses.map((course) => {
    const ids = (course.enrollments || []).map((e) => e.student.userId);
    const progressRows = ids.map((id) => progressMap.get(id)).filter(Boolean);
    const courseStudents = ids.map((id) => studentMap.get(id)).filter(Boolean);
    const atRisk = getRiskStudents({ students: courseStudents, progressMap });
    const thetaTrend = buildThetaTrend(progressRows);
    const competencyBreakdown = buildCompetencyBreakdown(progressRows);
    return {
      courseId: course.id,
      courseName: course.name,
      averageTheta: getCourseAverageTheta({ studentUserIds: ids, progressMap }),
      atRiskStudents: atRisk.length,
      trendDelta: getTrendDelta(thetaTrend),
      weakestCompetency: competencyBreakdown[0]?.competencyKey || ''
    };
  });

  const averageTheta = Number((
    courseMetrics.reduce((acc, item) => acc + Number(item.averageTheta || 0), 0) / Math.max(1, courseMetrics.length)
  ).toFixed(2));

  const weakCount = courseMetrics.reduce((acc, item) => {
    const key = normalizeLabel(item.weakestCompetency);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const recommendedCompetencies = Object.entries(weakCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => prettyLabel(key));

  const suggestedQuestionTags = await getSuggestedTags({
    weakestCompetencies: recommendedCompetencies.map((item) => ({ competencyKey: normalizeLabel(item) })),
    schoolId
  });

  const topAtRiskCourses = [...courseMetrics].sort((a, b) => b.atRiskStudents - a.atRiskStudents).slice(0, 5);

  const trendDelta = Number((
    courseMetrics.reduce((acc, item) => acc + Number(item.trendDelta || 0), 0) / Math.max(1, courseMetrics.length)
  ).toFixed(2));

  return {
    summary: { totalCourses: courses.length, overallAverageTheta: averageTheta, projectedSaber11Score: getProjectedSaber11Score(averageTheta), trendDelta },
    insights: {
      recommendedCompetencies,
      suggestedQuestionTags,
      alerts: trendDelta < -0.1
        ? [{ type: 'warning', title: 'Alerta global de descenso', message: 'El promedio theta de tus cursos muestra una tendencia negativa.' }]
        : [],
      recommendedActions: [
        'Prioriza microciclos de refuerzo en los cursos con mayor riesgo.',
        'Aumenta frecuencia de evaluaciones formativas en competencias criticas.',
        'Monitorea semanalmente estudiantes con inactividad de mas de 7 dias.'
      ]
    },
    topAtRiskCourses
  };
};

module.exports = { getCourseInsights, getDashboardInsights };
