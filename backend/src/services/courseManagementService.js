const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeTags = (tags) => {
  if (Array.isArray(tags)) return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
  if (typeof tags === 'string') return [...new Set(tags.split(',').map((tag) => tag.trim()).filter(Boolean))];
  return [];
};

const ensureTeacherCourseAccess = async (courseId, user) => {
  const where = { id: courseId, schoolId: user.schoolId };
  if (user.role !== 'admin') where.teacherId = user.id;

  const course = await prisma.course.findFirst({
    where,
    include: {
      enrollments: {
        include: { student: { select: { id: true, userId: true } } }
      }
    }
  });

  if (!course) throw buildError('Curso no encontrado o no autorizado', 404);
  return course;
};

const ensureStudentCourseAccess = async (courseId, userId) => {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw buildError('No tienes acceso a este curso', 403);

  const enrollment = await prisma.courseEnrollment.findFirst({
    where: { courseId, studentId: student.id }
  });
  if (!enrollment) throw buildError('No tienes acceso a este curso', 403);
  return enrollment;
};

const getMaterialStatsMap = async (materialIds) => {
  if (!materialIds.length) return new Map();

  // COUNT FILTER requires raw SQL — Prisma groupBy does not support conditional aggregates
  const rows = await prisma.$queryRaw`
    SELECT
      "materialId",
      COUNT(*)::int AS "openedCount",
      COUNT(*) FILTER (WHERE downloaded = true)::int AS "downloads",
      COALESCE(SUM("timeSpent"), 0)::int AS "totalTimeSpent",
      COUNT(DISTINCT "studentId")::int AS "studentsReached"
    FROM "MaterialAccess"
    WHERE "materialId" IN (${Prisma.join(materialIds)})
    GROUP BY "materialId"
  `;

  return new Map(
    rows.map((row) => [
      String(row.materialId),
      {
        openedCount: Number(row.openedCount),
        downloads: Number(row.downloads),
        totalTimeSpent: Number(row.totalTimeSpent),
        studentsReached: Number(row.studentsReached)
      }
    ])
  );
};

const mapMaterial = (material, statsMap) => ({
  ...material,
  stats: statsMap.get(String(material.id)) || {
    openedCount: 0, downloads: 0, totalTimeSpent: 0, studentsReached: 0
  }
});

const MATERIAL_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } }
};

const createCourseMaterial = async ({ courseId, payload, file, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  if (!file) throw buildError('Archivo requerido', 400);

  const title = String(payload.title || '').trim();
  if (!title) throw buildError('title es requerido', 400);

  const thetaTarget = payload.thetaTarget === undefined || payload.thetaTarget === null || payload.thetaTarget === ''
    ? null
    : Number(payload.thetaTarget);

  if (thetaTarget !== null && (!Number.isFinite(thetaTarget) || thetaTarget < -3 || thetaTarget > 3)) {
    throw buildError('thetaTarget debe estar entre -3 y 3', 400);
  }

  return prisma.courseMaterial.create({
    data: {
      schoolId: user.schoolId,
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
      createdById: user.id
    },
    include: MATERIAL_INCLUDE
  });
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

  const materials = await prisma.courseMaterial.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: MATERIAL_INCLUDE
  });

  const statsMap = await getMaterialStatsMap(materials.map((m) => m.id));
  return materials.map((material) => mapMaterial(material, statsMap));
};

const updateCourseMaterial = async ({ courseId, materialId, payload, file, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  const material = await prisma.courseMaterial.findFirst({ where: { id: materialId, courseId } });
  if (!material) throw buildError('Material no encontrado', 404);

  const updateData = {};

  if (payload.title !== undefined) {
    const title = String(payload.title || '').trim();
    if (!title) throw buildError('title no puede estar vacio', 400);
    updateData.title = title;
  }
  if (payload.description !== undefined) updateData.description = String(payload.description || '').trim();
  if (payload.area !== undefined) updateData.area = String(payload.area || '').trim();
  if (payload.competencia !== undefined) updateData.competencia = String(payload.competencia || '').trim();
  if (payload.isMandatory !== undefined) {
    updateData.isMandatory = String(payload.isMandatory) === 'true' || payload.isMandatory === true;
  }
  if (payload.tags !== undefined) updateData.tags = normalizeTags(payload.tags);
  if (payload.thetaTarget !== undefined) {
    const thetaTarget = payload.thetaTarget === null || payload.thetaTarget === ''
      ? null
      : Number(payload.thetaTarget);
    if (thetaTarget !== null && (!Number.isFinite(thetaTarget) || thetaTarget < -3 || thetaTarget > 3)) {
      throw buildError('thetaTarget debe estar entre -3 y 3', 400);
    }
    updateData.thetaTarget = thetaTarget;
  }

  if (file) {
    updateData.filePath = `/uploads/course-materials/${file.filename}`;
    updateData.fileType = file.mimetype;
  }

  return prisma.courseMaterial.update({
    where: { id: materialId },
    data: updateData,
    include: MATERIAL_INCLUDE
  });
};

const deleteCourseMaterial = async ({ courseId, materialId, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  const material = await prisma.courseMaterial.findFirst({ where: { id: materialId, courseId } });
  if (!material) throw buildError('Material no encontrado', 404);

  await prisma.$transaction([
    prisma.materialAccess.deleteMany({ where: { materialId } }),
    prisma.courseMaterial.delete({ where: { id: materialId } })
  ]);
};

const logMaterialAccess = async ({ courseId, materialId, studentId, payload }) => {
  await ensureStudentCourseAccess(courseId, studentId);

  const material = await prisma.courseMaterial.findFirst({ where: { id: materialId, courseId } });
  if (!material) throw buildError('Material no encontrado', 404);

  const openedAt = payload.openedAt ? new Date(payload.openedAt) : new Date();
  if (Number.isNaN(openedAt.getTime())) throw buildError('openedAt invalido', 400);

  const timeSpent = payload.timeSpent === undefined || payload.timeSpent === null || payload.timeSpent === ''
    ? 0
    : Number(payload.timeSpent);
  if (!Number.isFinite(timeSpent) || timeSpent < 0) throw buildError('timeSpent invalido', 400);

  const access = await prisma.materialAccess.create({
    data: { materialId, studentId, openedAt, downloaded: Boolean(payload.downloaded), timeSpent }
  });

  await prisma.user.update({ where: { id: studentId }, data: { lastActivity: new Date() } });

  return access;
};

const getMaterialOpenPayload = async ({ courseId, materialId, studentId }) => {
  await ensureStudentCourseAccess(courseId, studentId);

  const material = await prisma.courseMaterial.findFirst({ where: { id: materialId, courseId } });
  if (!material) throw buildError('Material no encontrado', 404);

  await prisma.materialAccess.create({
    data: { materialId, studentId, openedAt: new Date(), downloaded: false, timeSpent: 0 }
  });

  return material;
};

const getStudentWeeklyMetrics = async ({ studentUserIds, since }) => {
  if (!studentUserIds.length) return new Map();

  // Raw SQL for groupBy + SUM — studentId in MaterialAccess is User.id
  const accessRows = await prisma.$queryRaw`
    SELECT "studentId", COALESCE(SUM("timeSpent"), 0)::int AS "totalMaterialTime", COUNT(*)::int AS accesses
    FROM "MaterialAccess"
    WHERE "studentId" IN (${Prisma.join(studentUserIds)})
      AND "openedAt" >= ${since}
    GROUP BY "studentId"
  `;

  const evaluations = await prisma.evaluation.findMany({
    where: { studentId: { in: studentUserIds }, startedAt: { gte: since } },
    select: { studentId: true, startedAt: true, completedAt: true }
  });

  const evalSecondsMap = new Map();
  evaluations.forEach((ev) => {
    const key = ev.studentId;
    const end = ev.completedAt ? new Date(ev.completedAt) : new Date();
    const delta = Math.max(0, Math.floor((end - new Date(ev.startedAt)) / 1000));
    evalSecondsMap.set(key, (evalSecondsMap.get(key) || 0) + delta);
  });

  const result = new Map();
  accessRows.forEach((row) => {
    const key = row.studentId;
    const seconds = Number(row.totalMaterialTime) + (evalSecondsMap.get(key) || 0);
    result.set(key, {
      weeklySeconds: seconds,
      weeklyHours: Number((seconds / 3600).toFixed(2)),
      accesses: Number(row.accesses)
    });
  });

  evalSecondsMap.forEach((seconds, key) => {
    if (!result.has(key)) {
      result.set(key, { weeklySeconds: seconds, weeklyHours: Number((seconds / 3600).toFixed(2)), accesses: 0 });
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

  const enrollments = course.enrollments || [];
  if (!enrollments.length) return [];

  const studentUserIds = enrollments.map((e) => e.student.userId);
  const since = new Date(Date.now() - ONE_WEEK_MS);

  const [users, progresses, weeklyMetricsMap, recentAccesses] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: studentUserIds } },
      select: { id: true, name: true, email: true, lastActivity: true }
    }),
    prisma.studentProgress.findMany({
      where: { studentId: { in: studentUserIds } },
      include: {
        thetaHistory: { orderBy: { recordedAt: 'asc' }, take: 18 }
      }
    }),
    getStudentWeeklyMetrics({ studentUserIds, since }),
    prisma.materialAccess.findMany({
      where: { studentId: { in: studentUserIds } },
      orderBy: { openedAt: 'desc' },
      take: 500,
      select: { studentId: true, openedAt: true, downloaded: true, timeSpent: true }
    })
  ]);

  const progressMap = new Map(progresses.map((item) => [item.studentId, item]));

  const loginHistoryMap = new Map();
  recentAccesses.forEach((access) => {
    const key = access.studentId;
    if (!loginHistoryMap.has(key)) loginHistoryMap.set(key, []);
    const current = loginHistoryMap.get(key);
    if (current.length < 10) {
      current.push({ openedAt: access.openedAt, downloaded: access.downloaded, timeSpent: access.timeSpent });
    }
  });

  return users.map((user) => {
    const key = user.id;
    const progress = progressMap.get(key);
    const week = weeklyMetricsMap.get(key) || { weeklyHours: 0, weeklySeconds: 0, accesses: 0 };

    const history = progress?.thetaHistory || [];
    const latestTheta = history.length ? history[history.length - 1].theta : progress?.currentTheta || 0;
    const thetaAvg = history.length
      ? history.reduce((acc, row) => acc + Number(row.theta || 0), 0) / history.length
      : progress?.currentTheta || 0;

    const lastLogin = user.lastActivity || loginHistoryMap.get(key)?.[0]?.openedAt || null;

    return {
      studentId: user.id,
      name: user.name,
      email: user.email,
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
  const inactiveStudents = students.filter((s) => s.status === 'inactive');
  const studentsAtRisk = students.filter((s) => s.latestTheta < 0.4 || s.status === 'inactive').length;

  const activityGraph = students
    .map((s) => ({ studentId: s.studentId, name: s.name, weeklyHours: s.weeklyActiveHours, theta: s.latestTheta, status: s.status }))
    .sort((a, b) => b.weeklyHours - a.weeklyHours)
    .slice(0, 12);

  const materialsCount = await prisma.courseMaterial.count({ where: { courseId: course.id } });

  return {
    course: { id: course.id, name: course.name, grade: course.grade, year: course.year },
    metrics: { totalStudents, thetaAverage, weeklyHours, inactiveStudents: inactiveStudents.length, studentsAtRisk, materialsCount },
    activityGraph,
    inactiveStudents: inactiveStudents.map((s) => ({
      studentId: s.studentId, name: s.name, lastLogin: s.lastLogin, weeklyHours: s.weeklyActiveHours, theta: s.latestTheta
    }))
  };
};

const getCourseStudentDetail = async ({ courseId, studentId, user }) => {
  await ensureTeacherCourseAccess(courseId, user);

  const userRecord = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, name: true, email: true, lastActivity: true }
  });
  if (!userRecord) throw buildError('Estudiante no encontrado', 404);

  const student = await prisma.student.findUnique({ where: { userId: studentId } });
  if (!student) throw buildError('El estudiante no pertenece a este curso', 404);

  const enrollment = await prisma.courseEnrollment.findFirst({ where: { courseId, studentId: student.id } });
  if (!enrollment) throw buildError('El estudiante no pertenece a este curso', 404);

  const since = new Date(Date.now() - ONE_WEEK_MS);

  const [progress, weeklyMetricsMap, materialHistory] = await Promise.all([
    prisma.studentProgress.findUnique({
      where: { studentId },
      include: {
        thetaHistory: { orderBy: { recordedAt: 'asc' }, take: 24 },
        competencies: true,
        alerts: { where: { leida: false } }
      }
    }),
    getStudentWeeklyMetrics({ studentUserIds: [studentId], since }),
    prisma.materialAccess.findMany({
      where: { studentId },
      include: { material: { select: { id: true, title: true, courseId: true, area: true, competencia: true } } },
      orderBy: { openedAt: 'desc' },
      take: 30
    })
  ]);

  const week = weeklyMetricsMap.get(studentId) || { weeklySeconds: 0, weeklyHours: 0, accesses: 0 };
  const history = progress?.thetaHistory || [];
  const latestTheta = history.length ? history[history.length - 1].theta : progress?.currentTheta || 0;
  const avgTheta = history.length
    ? history.reduce((acc, row) => acc + Number(row.theta || 0), 0) / history.length
    : progress?.currentTheta || 0;

  return {
    student: {
      studentId: userRecord.id,
      name: userRecord.name,
      email: userRecord.email,
      lastLogin: userRecord.lastActivity,
      weeklyActiveTimeSeconds: week.weeklySeconds,
      weeklyActiveHours: week.weeklyHours,
      status: deriveActivityStatus({ weeklyHours: week.weeklyHours, lastLogin: userRecord.lastActivity }),
      totalSimulacrosCompleted: progress?.simulacrosCompletados || 0,
      latestTheta: Number((latestTheta || 0).toFixed(2)),
      averageTheta: Number((avgTheta || 0).toFixed(2)),
      competencies: progress?.competencies || [],
      alerts: progress?.alerts || []
    },
    loginHistory: materialHistory.map((row) => ({
      openedAt: row.openedAt,
      downloaded: row.downloaded,
      timeSpent: row.timeSpent,
      materialId: row.material?.id,
      materialTitle: row.material?.title,
      area: row.material?.area,
      competencia: row.material?.competencia
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
