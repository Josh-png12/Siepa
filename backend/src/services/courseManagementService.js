const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');
const StudentProgress = require('../models/StudentProgress');
const Evaluation = require('../models/Evaluation');
const CourseMaterial = require('../models/CourseMaterial');
const MaterialAccess = require('../models/MaterialAccess');

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) {
    return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  }
  if (typeof tags === 'string') {
    return [...new Set(tags.split(',').map((tag) => String(tag).trim()).filter(Boolean))];
  }
  return [];
};

const ensureTeacherCourseAccess = async (courseId, user) => {
  if (!isObjectId(courseId)) throw buildError('courseId invalido', 400);

  const where = { _id: courseId };
  if (user.role !== 'admin') {
    where.teacher = user.id;
  }

  const course = await Course.findOne(where).lean();
  if (!course) {
    throw buildError('Curso no encontrado o no autorizado', 404);
  }

  return course;
};

const ensureStudentCourseAccess = async (courseId, userId) => {
  if (!isObjectId(courseId)) throw buildError('courseId invalido', 400);

  const course = await Course.findOne({ _id: courseId, students: userId }).lean();
  if (!course) throw buildError('No tienes acceso a este curso', 403);
  return course;
};

const getMaterialStatsMap = async (materialIds) => {
  if (!materialIds.length) return new Map();

  const stats = await MaterialAccess.aggregate([
    {
      $match: {
        materialId: { $in: materialIds }
      }
    },
    {
      $group: {
        _id: '$materialId',
        openedCount: { $sum: 1 },
        downloads: {
          $sum: {
            $cond: [{ $eq: ['$downloaded', true] }, 1, 0]
          }
        },
        totalTimeSpent: { $sum: '$timeSpent' },
        studentsReached: { $addToSet: '$studentId' }
      }
    }
  ]);

  return new Map(
    stats.map((item) => [
      String(item._id),
      {
        openedCount: item.openedCount,
        downloads: item.downloads,
        totalTimeSpent: item.totalTimeSpent || 0,
        studentsReached: (item.studentsReached || []).length
      }
    ])
  );
};

const mapMaterial = (material, statsMap) => {
  const stats = statsMap.get(String(material._id)) || {
    openedCount: 0,
    downloads: 0,
    totalTimeSpent: 0,
    studentsReached: 0
  };

  return {
    ...material,
    stats
  };
};

const createCourseMaterial = async ({ courseId, payload, file, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  if (!file) {
    throw buildError('Archivo requerido', 400);
  }

  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const thetaTarget = payload.thetaTarget === undefined || payload.thetaTarget === null || payload.thetaTarget === ''
    ? null
    : Number(payload.thetaTarget);

  if (thetaTarget !== null && (!Number.isFinite(thetaTarget) || thetaTarget < -3 || thetaTarget > 3)) {
    throw buildError('thetaTarget debe estar entre -3 y 3', 400);
  }

  const doc = await CourseMaterial.create({
    courseId,
    title,
    description: String(payload.description || '').trim(),
    filePath: `/uploads/course-materials/${file.filename}`,
    fileType: file.mimetype,
    area: String(payload.area || '').trim(),
    competencia: String(payload.competencia || '').trim(),
    thetaTarget,
    isMandatory: String(payload.isMandatory) === 'true' || payload.isMandatory === true,
    tags: normalizeTags(payload.tags),
    createdBy: user.id
  });

  return CourseMaterial.findById(doc._id)
    .populate('createdBy', 'name email role')
    .lean();
};

const getCourseMaterials = async ({ courseId, user, query }) => {
  if (user.role === 'estudiante') {
    await ensureStudentCourseAccess(courseId, user.id);
  } else {
    await ensureTeacherCourseAccess(courseId, user);
  }

  const where = { courseId };
  if (query.area) where.area = query.area;
  if (query.competencia) where.competencia = query.competencia;

  const materials = await CourseMaterial.find(where)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email role')
    .lean();

  const statsMap = await getMaterialStatsMap(materials.map((m) => m._id));

  return materials.map((material) => mapMaterial(material, statsMap));
};

const updateCourseMaterial = async ({ courseId, materialId, payload, file, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  if (!isObjectId(materialId)) throw buildError('materialId invalido', 400);

  const material = await CourseMaterial.findOne({ _id: materialId, courseId });
  if (!material) throw buildError('Material no encontrado', 404);

  if (payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) throw buildError('title no puede estar vacio', 400);
    material.title = title;
  }

  if (payload.description !== undefined) material.description = String(payload.description || '').trim();
  if (payload.area !== undefined) material.area = String(payload.area || '').trim();
  if (payload.competencia !== undefined) material.competencia = String(payload.competencia || '').trim();
  if (payload.isMandatory !== undefined) {
    material.isMandatory = String(payload.isMandatory) === 'true' || payload.isMandatory === true;
  }
  if (payload.tags !== undefined) material.tags = normalizeTags(payload.tags);
  if (payload.thetaTarget !== undefined) {
    const thetaTarget = payload.thetaTarget === null || payload.thetaTarget === ''
      ? null
      : Number(payload.thetaTarget);
    if (thetaTarget !== null && (!Number.isFinite(thetaTarget) || thetaTarget < -3 || thetaTarget > 3)) {
      throw buildError('thetaTarget debe estar entre -3 y 3', 400);
    }
    material.thetaTarget = thetaTarget;
  }

  if (file) {
    material.filePath = `/uploads/course-materials/${file.filename}`;
    material.fileType = file.mimetype;
  }

  await material.save();

  return CourseMaterial.findById(material._id)
    .populate('createdBy', 'name email role')
    .lean();
};

const deleteCourseMaterial = async ({ courseId, materialId, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  if (!isObjectId(materialId)) throw buildError('materialId invalido', 400);

  const material = await CourseMaterial.findOne({ _id: materialId, courseId }).lean();
  if (!material) throw buildError('Material no encontrado', 404);

  await Promise.all([
    MaterialAccess.deleteMany({ materialId }),
    CourseMaterial.deleteOne({ _id: materialId })
  ]);
};

const logMaterialAccess = async ({ courseId, materialId, studentId, payload }) => {
  await ensureStudentCourseAccess(courseId, studentId);

  if (!isObjectId(materialId)) throw buildError('materialId invalido', 400);

  const material = await CourseMaterial.findOne({ _id: materialId, courseId }).lean();
  if (!material) throw buildError('Material no encontrado', 404);

  const openedAt = payload.openedAt ? new Date(payload.openedAt) : new Date();
  if (Number.isNaN(openedAt.getTime())) throw buildError('openedAt invalido', 400);

  const timeSpent = payload.timeSpent === undefined || payload.timeSpent === null || payload.timeSpent === ''
    ? 0
    : Number(payload.timeSpent);

  if (!Number.isFinite(timeSpent) || timeSpent < 0) {
    throw buildError('timeSpent invalido', 400);
  }

  const access = await MaterialAccess.create({
    materialId,
    studentId,
    openedAt,
    downloaded: Boolean(payload.downloaded),
    timeSpent
  });

  await User.findByIdAndUpdate(studentId, { $set: { lastActivity: new Date() } });

  return access.toObject();
};

const getMaterialOpenPayload = async ({ courseId, materialId, studentId }) => {
  await ensureStudentCourseAccess(courseId, studentId);

  if (!isObjectId(materialId)) throw buildError('materialId invalido', 400);

  const material = await CourseMaterial.findOne({ _id: materialId, courseId }).lean();
  if (!material) throw buildError('Material no encontrado', 404);

  await MaterialAccess.create({
    materialId,
    studentId,
    openedAt: new Date(),
    downloaded: false,
    timeSpent: 0
  });

  return material;
};

const getStudentWeeklyMetrics = async ({ studentIds, since }) => {
  const [accessAgg, evaluations] = await Promise.all([
    MaterialAccess.aggregate([
      {
        $match: {
          studentId: { $in: studentIds },
          openedAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$studentId',
          totalMaterialTime: { $sum: '$timeSpent' },
          accesses: { $sum: 1 }
        }
      }
    ]),
    Evaluation.find({
      student: { $in: studentIds },
      startedAt: { $gte: since }
    })
      .select('student startedAt completedAt')
      .lean()
  ]);

  const evalSecondsMap = new Map();
  evaluations.forEach((evaluation) => {
    const key = String(evaluation.student);
    const end = evaluation.completedAt ? new Date(evaluation.completedAt) : new Date();
    const start = new Date(evaluation.startedAt);
    const delta = Math.max(0, Math.floor((end - start) / 1000));
    evalSecondsMap.set(key, (evalSecondsMap.get(key) || 0) + delta);
  });

  const result = new Map();
  accessAgg.forEach((item) => {
    const key = String(item._id);
    const seconds = (item.totalMaterialTime || 0) + (evalSecondsMap.get(key) || 0);
    result.set(key, {
      weeklySeconds: seconds,
      weeklyHours: Number((seconds / 3600).toFixed(2)),
      accesses: item.accesses || 0
    });
  });

  evalSecondsMap.forEach((seconds, key) => {
    if (!result.has(key)) {
      result.set(key, {
        weeklySeconds: seconds,
        weeklyHours: Number((seconds / 3600).toFixed(2)),
        accesses: 0
      });
    }
  });

  return result;
};

const deriveActivityStatus = ({ weeklyHours, lastLogin }) => {
  const now = Date.now();
  const daysSinceLastLogin = lastLogin ? (now - new Date(lastLogin).getTime()) / (24 * 60 * 60 * 1000) : Infinity;

  if (weeklyHours >= 3 || daysSinceLastLogin <= 3) return 'active';
  if (weeklyHours >= 1 || daysSinceLastLogin <= 7) return 'intermittent';
  return 'inactive';
};

const getCourseStudentsStats = async ({ courseId, user }) => {
  const course = await ensureTeacherCourseAccess(courseId, user);

  const studentIds = (course.students || []).map((id) => toObjectId(id));
  if (!studentIds.length) return [];

  const since = new Date(Date.now() - ONE_WEEK_MS);

  const [students, progresses, weeklyMetricsMap, recentAccesses] = await Promise.all([
    User.find({ _id: { $in: studentIds } })
      .select('name email lastActivity')
      .lean(),
    StudentProgress.find({ student: { $in: studentIds } })
      .select('student currentTheta historialTheta simulacrosCompletados')
      .lean(),
    getStudentWeeklyMetrics({ studentIds, since }),
    MaterialAccess.find({ studentId: { $in: studentIds } })
      .sort({ openedAt: -1 })
      .select('studentId openedAt downloaded timeSpent')
      .limit(500)
      .lean()
  ]);

  const progressMap = new Map(progresses.map((item) => [String(item.student), item]));
  const loginHistoryMap = new Map();

  recentAccesses.forEach((access) => {
    const key = String(access.studentId);
    if (!loginHistoryMap.has(key)) loginHistoryMap.set(key, []);
    const current = loginHistoryMap.get(key);
    if (current.length < 10) {
      current.push({
        openedAt: access.openedAt,
        downloaded: access.downloaded,
        timeSpent: access.timeSpent
      });
    }
  });

  return students.map((student) => {
    const key = String(student._id);
    const progress = progressMap.get(key);
    const week = weeklyMetricsMap.get(key) || { weeklyHours: 0, weeklySeconds: 0, accesses: 0 };

    const latestTheta = progress?.historialTheta?.length
      ? progress.historialTheta[progress.historialTheta.length - 1].theta
      : progress?.currentTheta || 0;

    const thetaAvg = progress?.historialTheta?.length
      ? progress.historialTheta.reduce((acc, row) => acc + (Number(row.theta) || 0), 0) / progress.historialTheta.length
      : progress?.currentTheta || 0;

    const lastLogin = student.lastActivity || loginHistoryMap.get(key)?.[0]?.openedAt || null;

    return {
      studentId: student._id,
      name: student.name,
      email: student.email,
      lastLogin,
      weeklyActiveTimeSeconds: week.weeklySeconds,
      weeklyActiveHours: week.weeklyHours,
      totalSimulacrosCompleted: progress?.simulacrosCompletados || 0,
      latestTheta: Number((latestTheta || 0).toFixed(2)),
      averageTheta: Number((thetaAvg || 0).toFixed(2)),
      status: deriveActivityStatus({ weeklyHours: week.weeklyHours, lastLogin }),
      loginHistory: loginHistoryMap.get(key) || []
    };
  });
};

const getCourseDashboard = async ({ courseId, user }) => {
  const course = await ensureTeacherCourseAccess(courseId, user);

  const students = await getCourseStudentsStats({ courseId, user });

  const totalStudents = students.length;
  const thetaAverage = totalStudents
    ? Number((students.reduce((acc, s) => acc + (s.latestTheta || 0), 0) / totalStudents).toFixed(2))
    : 0;

  const weeklyHours = Number(students.reduce((acc, s) => acc + (s.weeklyActiveHours || 0), 0).toFixed(2));
  const inactiveStudents = students.filter((student) => student.status === 'inactive');
  const studentsAtRisk = students.filter((student) => student.latestTheta < 0.4 || student.status === 'inactive').length;

  const activityGraph = students
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      weeklyHours: student.weeklyActiveHours,
      theta: student.latestTheta,
      status: student.status
    }))
    .sort((a, b) => b.weeklyHours - a.weeklyHours)
    .slice(0, 12);

  const materialsCount = await CourseMaterial.countDocuments({ courseId: course._id });

  return {
    course: {
      _id: course._id,
      name: course.name,
      grade: course.grade,
      year: course.year
    },
    metrics: {
      totalStudents,
      thetaAverage,
      weeklyHours,
      inactiveStudents: inactiveStudents.length,
      studentsAtRisk,
      materialsCount
    },
    activityGraph,
    inactiveStudents: inactiveStudents.map((student) => ({
      studentId: student.studentId,
      name: student.name,
      lastLogin: student.lastLogin,
      weeklyHours: student.weeklyActiveHours,
      theta: student.latestTheta
    }))
  };
};

const getCourseStudentDetail = async ({ courseId, studentId, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  if (!isObjectId(studentId)) throw buildError('studentId invalido', 400);

  const student = await User.findById(studentId).select('name email lastActivity').lean();
  if (!student) throw buildError('Estudiante no encontrado', 404);

  const course = await Course.findOne({ _id: courseId, students: studentId }).lean();
  if (!course) throw buildError('El estudiante no pertenece a este curso', 404);

  const since = new Date(Date.now() - ONE_WEEK_MS);

  const [progress, weeklyMetricsMap, materialHistory] = await Promise.all([
    StudentProgress.findOne({ student: studentId })
      .select('currentTheta historialTheta simulacrosCompletados competencies alertas')
      .lean(),
    getStudentWeeklyMetrics({ studentIds: [toObjectId(studentId)], since }),
    MaterialAccess.find({ studentId })
      .populate('materialId', 'title courseId area competencia')
      .sort({ openedAt: -1 })
      .limit(30)
      .lean()
  ]);

  const week = weeklyMetricsMap.get(String(studentId)) || { weeklySeconds: 0, weeklyHours: 0, accesses: 0 };
  const latestTheta = progress?.historialTheta?.length
    ? progress.historialTheta[progress.historialTheta.length - 1].theta
    : progress?.currentTheta || 0;

  const avgTheta = progress?.historialTheta?.length
    ? progress.historialTheta.reduce((acc, row) => acc + (Number(row.theta) || 0), 0) / progress.historialTheta.length
    : progress?.currentTheta || 0;

  const status = deriveActivityStatus({
    weeklyHours: week.weeklyHours,
    lastLogin: student.lastActivity
  });

  return {
    student: {
      studentId: student._id,
      name: student.name,
      email: student.email,
      lastLogin: student.lastActivity,
      weeklyActiveTimeSeconds: week.weeklySeconds,
      weeklyActiveHours: week.weeklyHours,
      status,
      totalSimulacrosCompleted: progress?.simulacrosCompletados || 0,
      latestTheta: Number((latestTheta || 0).toFixed(2)),
      averageTheta: Number((avgTheta || 0).toFixed(2)),
      competencies: progress?.competencies || [],
      alerts: progress?.alertas || []
    },
    loginHistory: materialHistory.map((row) => ({
      openedAt: row.openedAt,
      downloaded: row.downloaded,
      timeSpent: row.timeSpent,
      materialId: row.materialId?._id,
      materialTitle: row.materialId?.title,
      area: row.materialId?.area,
      competencia: row.materialId?.competencia
    }))
  };
};

module.exports = {
  buildError,
  createCourseMaterial,
  getCourseMaterials,
  updateCourseMaterial,
  deleteCourseMaterial,
  logMaterialAccess,
  getMaterialOpenPayload,
  getCourseDashboard,
  getCourseStudentsStats,
  getCourseStudentDetail
};
