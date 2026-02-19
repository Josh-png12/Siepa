const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const StudentProgress = require('../models/StudentProgress');
const Question = require('../models/Question');

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const normalizeLabel = (value = '') => String(value || '').trim().toLowerCase();

const prettyLabel = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return 'Sin definir';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getStudentProgressMap = async (studentIds) => {
  if (!studentIds.length) return new Map();

  const progresses = await StudentProgress.find({
    student: { $in: studentIds }
  })
    .select('student currentTheta historialTheta competencies simulacrosCompletados')
    .lean();

  return new Map(progresses.map((item) => [String(item.student), item]));
};

const getCourseAverageTheta = ({ course, progressMap }) => {
  const ids = (course.students || []).map((id) => String(id));
  if (!ids.length) return 0;
  const values = ids
    .map((id) => Number(progressMap.get(id)?.currentTheta || 0))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(2));
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
    const history = (progress.historialTheta || []).slice(-18);
    history.forEach((entry) => {
      if (!entry?.date) return;
      const date = new Date(entry.date);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key).push(Number(entry.theta || 0));
    });
  });

  const rows = [...monthMap.entries()]
    .map(([month, values]) => ({
      month,
      avgTheta: Number((values.reduce((acc, value) => acc + value, 0) / Math.max(1, values.length)).toFixed(2))
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-8);

  if (rows.length) return rows;

  const fallback = progresses
    .map((progress) => Number(progress.currentTheta || 0))
    .filter((value) => Number.isFinite(value));
  const now = new Date();
  return [{
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    avgTheta: Number((fallback.reduce((acc, value) => acc + value, 0) / Math.max(1, fallback.length)).toFixed(2))
  }];
};

const buildHeatmap = ({ students, progressMap, competencyKeys }) =>
  students.slice(0, 30).map((student) => {
    const progress = progressMap.get(String(student._id));
    const competencyMap = new Map(
      (progress?.competencies || []).map((entry) => [normalizeLabel(entry.area), Number(entry.theta || 0)])
    );

    return {
      studentId: student._id,
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
    const progress = progressMap.get(String(student._id));
    if (!progress) return;

    const latestTheta = Number(progress.currentTheta || 0);
    const history = (progress.historialTheta || []).slice(-6);
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
      studentId: student._id,
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

const getSuggestedTags = async ({ weakestCompetencies }) => {
  if (!weakestCompetencies.length) return [];

  const weakKeys = weakestCompetencies.map((item) => item.competencyKey);
  const tags = await Question.aggregate([
    {
      $match: {
        area: {
          $in: weakKeys.map((key) => new RegExp(`^${key}$`, 'i'))
        }
      }
    },
    { $group: { _id: '$competencia', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 6 }
  ]);

  return tags
    .filter((item) => item._id)
    .map((item) => ({
      tag: String(item._id),
      availableQuestions: item.count
    }));
};

const getProjectedSaber11Score = (averageTheta) =>
  Math.round(clamp(250 + Number(averageTheta || 0) * 70, 0, 500));

const getTeacherCourses = async (teacherId) =>
  Course.find({ teacher: teacherId })
    .select('_id name grade year students')
    .lean();

const ensureCourseOwnership = async (courseId, teacherId) => {
  if (!isObjectId(courseId)) throw buildError('courseId invalido', 400);

  const course = await Course.findOne({
    _id: courseId,
    teacher: teacherId
  })
    .select('_id name grade year students')
    .lean();

  if (!course) throw buildError('Curso no encontrado o no autorizado', 404);
  return course;
};

const getCourseStudents = async (studentIds) =>
  User.find({ _id: { $in: studentIds } })
    .select('_id name email lastActivity')
    .lean();

const getCourseInsights = async ({ courseId, teacherId }) => {
  const course = await ensureCourseOwnership(courseId, teacherId);
  const studentIds = (course.students || []).map((id) => toObjectId(id));
  const students = await getCourseStudents(studentIds);
  const progressMap = await getStudentProgressMap(studentIds);
  const progresses = students
    .map((student) => progressMap.get(String(student._id)))
    .filter(Boolean);

  const competencyBreakdown = buildCompetencyBreakdown(progresses);
  const thetaTrend = buildThetaTrend(progresses);
  const weakestCompetencies = competencyBreakdown.slice(0, 2);
  const atRiskStudents = getRiskStudents({ students, progressMap });
  const competencyKeys = competencyBreakdown.map((item) => item.competencyKey);
  const heatmap = buildHeatmap({ students, progressMap, competencyKeys });

  const teacherCourses = await getTeacherCourses(teacherId);
  const allStudentIds = [...new Set(teacherCourses.flatMap((item) => item.students.map((id) => String(id))))];
  const allProgressMap = await getStudentProgressMap(allStudentIds.map((id) => toObjectId(id)));
  const comparison = teacherCourses.map((item) => ({
    courseId: item._id,
    courseName: item.name,
    avgTheta: getCourseAverageTheta({ course: item, progressMap: allProgressMap })
  }));
  comparison.sort((a, b) => b.avgTheta - a.avgTheta);

  const currentAvgTheta = getCourseAverageTheta({ course, progressMap });
  const currentPosition = comparison.findIndex((item) => String(item.courseId) === String(course._id)) + 1;

  const trendDelta = getTrendDelta(thetaTrend);
  const suggestedTags = await getSuggestedTags({ weakestCompetencies });
  const projectedSaber11Score = getProjectedSaber11Score(currentAvgTheta);

  return {
    course: {
      _id: course._id,
      name: course.name,
      grade: course.grade,
      year: course.year
    },
    metrics: {
      totalStudents: students.length,
      averageTheta: currentAvgTheta,
      weakestCompetency: weakestCompetencies[0]?.competency || 'Sin datos',
      atRiskStudents: atRiskStudents.length,
      projectedSaber11Score,
      trendDelta
    },
    charts: {
      competencyBreakdown,
      thetaTrend,
      comparison,
      heatmap
    },
    insights: {
      recommendedCompetencies: weakestCompetencies.map((item) => item.competency),
      suggestedQuestionTags: suggestedTags,
      alerts: [
        ...(trendDelta < -0.1
          ? [{
            type: 'warning',
            title: 'Descenso de rendimiento',
            message: `El promedio theta del curso cayo ${Math.abs(trendDelta).toFixed(2)} puntos en el ultimo periodo.`
          }]
          : []),
        ...(atRiskStudents.length
          ? [{
            type: 'danger',
            title: 'Estudiantes en riesgo',
            message: `${atRiskStudents.length} estudiantes requieren intervencion prioritaria.`
          }]
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

const getDashboardInsights = async ({ teacherId }) => {
  const courses = await getTeacherCourses(teacherId);
  if (!courses.length) {
    return {
      summary: {
        totalCourses: 0,
        overallAverageTheta: 0,
        projectedSaber11Score: 250,
        trendDelta: 0
      },
      insights: {
        recommendedCompetencies: [],
        suggestedQuestionTags: [],
        alerts: [],
        recommendedActions: []
      },
      topAtRiskCourses: []
    };
  }

  const allStudentIds = [...new Set(courses.flatMap((item) => item.students.map((id) => String(id))))];
  const studentIdsAsObjectId = allStudentIds.map((id) => toObjectId(id));
  const progressMap = await getStudentProgressMap(studentIdsAsObjectId);
  const students = await getCourseStudents(studentIdsAsObjectId);
  const studentMap = new Map(students.map((student) => [String(student._id), student]));

  const courseMetrics = courses.map((course) => {
    const ids = (course.students || []).map((id) => String(id));
    const progressRows = ids.map((id) => progressMap.get(id)).filter(Boolean);
    const courseStudents = ids.map((id) => studentMap.get(id)).filter(Boolean);
    const atRisk = getRiskStudents({ students: courseStudents, progressMap });
    const thetaTrend = buildThetaTrend(progressRows);
    const competencyBreakdown = buildCompetencyBreakdown(progressRows);
    return {
      courseId: course._id,
      courseName: course.name,
      averageTheta: getCourseAverageTheta({ course, progressMap }),
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
    weakestCompetencies: recommendedCompetencies.map((item) => ({
      competencyKey: normalizeLabel(item)
    }))
  });

  const topAtRiskCourses = [...courseMetrics]
    .sort((a, b) => b.atRiskStudents - a.atRiskStudents)
    .slice(0, 5);

  const trendDelta = Number((
    courseMetrics.reduce((acc, item) => acc + Number(item.trendDelta || 0), 0) / Math.max(1, courseMetrics.length)
  ).toFixed(2));

  return {
    summary: {
      totalCourses: courses.length,
      overallAverageTheta: averageTheta,
      projectedSaber11Score: getProjectedSaber11Score(averageTheta),
      trendDelta
    },
    insights: {
      recommendedCompetencies,
      suggestedQuestionTags,
      alerts: trendDelta < -0.1
        ? [{
          type: 'warning',
          title: 'Alerta global de descenso',
          message: 'El promedio theta de tus cursos muestra una tendencia negativa.'
        }]
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

module.exports = {
  getCourseInsights,
  getDashboardInsights
};
