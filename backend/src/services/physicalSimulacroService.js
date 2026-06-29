const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { parsePDF, evaluateAnswerSheet } = require('./omrService');
const { estimateTheta } = require('./triService');
const ocrQueue = require('./ocrProcessingQueue');
const { logAudit } = require('./auditLogService');
const { parsePagination } = require('../validators/ocrValidators');
const {
  validateCreatePhysicalSimulacroPayload,
  validateReviewPayload
} = require('../validators/physicalSimulacroValidators');
const { generateQRToken } = require('../utils/qrToken');
const { generateStudentDocuments } = require('./pdfGeneratorService');
const { transitionStatus, RESULT_STATUS_CONFIDENCE_THRESHOLD } = require('./simulacroStatusService');

const FILE_RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS || 14);

const ensureTeacherAccess = async ({ simulacroId, user }) => {
  const where = { id: simulacroId };
  if (user.role !== 'admin') where.teacherId = user.id;

  const simulacro = await prisma.physicalSimulacro.findFirst({
    where,
    include: {
      answerKey: { orderBy: { questionNumber: 'asc' } },
      courses: { select: { id: true, name: true, grade: true } }
    }
  });

  if (!simulacro) throw new ApiError(404, 'NotFound', ['Physical simulacro not found or no access']);
  return simulacro;
};

// Check if a student (by userId) is enrolled in any course assigned to this simulacro
const ensureStudentInSimulacroCourses = async ({ studentUserId, simulacroId }) => {
  const studentRecord = await prisma.student.findUnique({ where: { userId: studentUserId } });
  if (!studentRecord) return null;

  const enrollment = await prisma.courseEnrollment.findFirst({
    where: {
      studentId: studentRecord.id,
      course: { physicalSimulacros: { some: { id: simulacroId } } }
    },
    include: { course: { select: { id: true, name: true } } }
  });

  return enrollment?.course || null;
};

const buildThetaCalculator = (answerKey = []) => {
  const items = answerKey.map((row) => ({
    _id: String(row.questionNumber),
    a: 1,
    b: 0,
    c: 0.2,
    correctAnswer: row.correctOption
  }));

  return (parsedAnswers) => {
    const responses = parsedAnswers
      .filter((row) => row.markedOption)
      .map((row) => ({ questionId: String(row.questionNumber), selectedOption: row.markedOption }));

    if (!responses.length) return 0;
    return estimateTheta(responses, items, 0);
  };
};

const computeExpectedStudents = async (simulacroId) => {
  const simulacro = await prisma.physicalSimulacro.findUnique({
    where: { id: simulacroId },
    include: { courses: { select: { id: true } } }
  });
  if (!simulacro) return 0;

  const courseIds = simulacro.courses.map((c) => c.id);
  if (!courseIds.length) return 0;

  // COUNT DISTINCT studentId because a student may be enrolled in multiple courses
  const result = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT "studentId")::int AS count
    FROM "CourseEnrollment"
    WHERE "courseId" IN (${Prisma.join(courseIds)})
  `;

  return Number(result[0]?.count || 0);
};

const createAdminPhysicalSimulacro = async ({ userId, schoolId, payload }) => {
  const validation = validateCreatePhysicalSimulacroPayload(payload);
  if (validation.errors) throw new ApiError(400, 'ValidationError', validation.errors);

  const data = validation.value;

  const teacher = await prisma.user.findFirst({
    where: { id: data.teacher, role: 'docente', schoolId },
    select: { id: true, schoolId: true, featurePhysicalSimulacros: true }
  });
  if (!teacher) throw new ApiError(404, 'NotFound', ['Teacher not found']);

  const courses = await prisma.course.findMany({
    where: { id: { in: data.courses }, schoolId },
    select: { id: true, teacherId: true }
  });

  if (courses.length !== data.courses.length) {
    throw new ApiError(404, 'NotFound', ['One or more courses not found']);
  }

  const unauthorized = courses.find((c) => c.teacherId !== data.teacher);
  if (unauthorized) {
    throw new ApiError(403, 'Forbidden', ['All courses must belong to assigned teacher']);
  }

  const reviewDeadline = new Date(data.date);
  reviewDeadline.setDate(reviewDeadline.getDate() + data.reviewWindowDays);

  const status = data.answerKey.length === data.totalQuestions ? 'readyForUpload' : 'answerKeyPending';

  const simulacro = await prisma.physicalSimulacro.create({
    data: {
      schoolId: teacher.schoolId,
      title: data.title,
      description: data.description || '',
      teacherId: data.teacher,
      date: new Date(data.date),
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      status,
      totalQuestions: data.totalQuestions,
      reviewDeadline,
      courses: { connect: data.courses.map((id) => ({ id })) },
      answerKey: {
        create: data.answerKey.map((key) => ({
          questionNumber: key.questionNumber,
          correctOption: key.correctOption
        }))
      }
    },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      courses: { select: { id: true, name: true, grade: true } },
      answerKey: { orderBy: { questionNumber: 'asc' } }
    }
  });

  await logAudit({
    schoolId: simulacro.schoolId,
    userId,
    action: 'create',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro.id,
    metadata: { status, teacher: data.teacher, totalQuestions: data.totalQuestions }
  });

  return simulacro;
};

const buildTeacherSimulacroStats = async (simulacroIds) => {
  if (!simulacroIds.length) return { sheetMap: new Map(), scoreMap: new Map(), expectedMap: new Map() };

  const [sheetStats, scoreStats] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        "physicalSimulacroId",
        COUNT(*)::int AS "sheetsReceived",
        COUNT(*) FILTER (WHERE status = 'needsReview')::int AS "sheetsPendingReview",
        COUNT(*) FILTER (WHERE status = 'duplicate')::int AS "duplicatesDetected"
      FROM "PhysicalAnswerSheet"
      WHERE "physicalSimulacroId" IN (${Prisma.join(simulacroIds)})
      GROUP BY "physicalSimulacroId"
    `,
    prisma.$queryRaw`
      SELECT "physicalSimulacroId", AVG(score) AS "averageScore"
      FROM "PhysicalAnswerSheet"
      WHERE "physicalSimulacroId" IN (${Prisma.join(simulacroIds)})
        AND score IS NOT NULL
        AND status IN ('valid', 'needsReview', 'invalid')
      GROUP BY "physicalSimulacroId"
    `
  ]);

  const sheetMap = new Map(sheetStats.map((row) => [String(row.physicalSimulacroId), row]));
  const scoreMap = new Map(scoreStats.map((row) => [String(row.physicalSimulacroId), row]));

  const expectedMap = new Map();
  await Promise.all(
    simulacroIds.map(async (id) => {
      expectedMap.set(String(id), await computeExpectedStudents(String(id)));
    })
  );

  return { sheetMap, scoreMap, expectedMap };
};

const listTeacherOcrSimulacros = async ({ user, query }) => {
  const { page, limit, skip } = parsePagination(query);

  const where = { teacherId: user.id };
  if (query.status) where.status = query.status;

  const [total, items] = await Promise.all([
    prisma.physicalSimulacro.count({ where }),
    prisma.physicalSimulacro.findMany({
      where,
      select: {
        id: true, title: true, date: true, status: true, reviewDeadline: true,
        courses: { select: { id: true, name: true } }
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit
    })
  ]);

  const simulacroIds = items.map((item) => item.id);
  const { sheetMap, scoreMap, expectedMap } = await buildTeacherSimulacroStats(simulacroIds);

  const rows = items.map((item) => {
    const key = item.id;
    const sheets = sheetMap.get(key) || {};
    const score = scoreMap.get(key) || {};

    return {
      id: item.id,
      title: item.title,
      date: item.date,
      status: item.status,
      courseName: (item.courses || []).map((c) => c.name).join(', '),
      expectedStudents: expectedMap.get(key) || 0,
      sheetsReceived: Number(sheets.sheetsReceived || 0),
      sheetsPendingReview: Number(sheets.sheetsPendingReview || 0),
      duplicatesDetected: Number(sheets.duplicatesDetected || 0),
      averageScore: Number((score.averageScore || 0).toFixed(2))
    };
  });

  return { items: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const getTeacherOcrSimulacroDetail = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const [sheets, expectedStudents] = await Promise.all([
    prisma.physicalAnswerSheet.findMany({
      where: { physicalSimulacroId: simulacro.id },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    computeExpectedStudents(simulacro.id)
  ]);

  const summary = {
    id: simulacro.id,
    title: simulacro.title,
    date: simulacro.date,
    status: simulacro.status,
    course: (simulacro.courses || []).map((c) => c.name).join(', '),
    studentsExpected: expectedStudents,
    sheetsReceived: sheets.length,
    sheetsWithErrors: sheets.filter((s) => ((s.errors || []).length > 0) || s.status === 'needsReview').length
  };

  const mappedSheets = sheets.map((sheet) => ({
    id: sheet.id,
    studentId: sheet.studentId,
    studentName: sheet.student?.name || 'Unknown',
    studentEmail: sheet.student?.email || '',
    qrToken: sheet.qrToken,
    status: sheet.status,
    score: sheet.score,
    theta: sheet.theta,
    validAnswers: ((sheet.parsedAnswers || []).filter((row) => row.markedOption)).length,
    errors: ((sheet.errors || []).length),
    parsedResponses: sheet.parsedAnswers,
    manualCorrections: sheet.manualCorrections,
    processedAt: sheet.processedAt,
    previewUrl: sheet.rawFilePath ? `/${String(sheet.rawFilePath).replace(/^\/+/, '')}` : null
  }));

  return { summary, sheets: mappedSheets };
};

const extractStudentIdFromQr = (qr) => {
  if (!qr) return null;
  return qr.studentId || qr.studentID || null;
};

const ensureSafePathForDelete = async (rawFilePath) => {
  if (!rawFilePath) return;
  const absolute = path.resolve(path.join(process.cwd(), rawFilePath.replace(/^\/+/, '')));
  const base = path.resolve(path.join(process.cwd(), 'uploads', 'physical-simulacros'));
  if (!absolute.startsWith(base)) return;
  try {
    await fs.unlink(absolute);
  } catch (_error) {
    // ignore missing files
  }
};

const processUploadedFileJob = async ({ user, simulacro, file, pagePayloads, thetaCalculator }) => {
  let resolvedPayloads = pagePayloads;
  if (!Array.isArray(resolvedPayloads) || resolvedPayloads.length === 0) {
    const { generatePagePayloads } = require('./bubbleDetectionService');
    resolvedPayloads = await generatePagePayloads(file.path, { totalQuestions: simulacro.totalQuestions });
  }
  const parsed = await parsePDF(file.path, { pagePayloads: resolvedPayloads, totalQuestions: simulacro.totalQuestions });

  for (const page of parsed.pages) {
    const qrToken = String(page.qrToken || '').trim();
    const qr = page.qr;

    if (!qrToken) {
      await prisma.physicalAnswerSheet.create({
        data: {
          physicalSimulacroId: simulacro.id,
          studentId: user.id,
          qrToken: `missing-qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
          parsedAnswers: [],
          status: 'invalid',
          errors: [{ type: 'MISSING_QR', message: 'QR not detected' }],
          processedAt: new Date()
        }
      });
      continue;
    }

    const existingByQr = await prisma.physicalAnswerSheet.findUnique({
      where: { physicalSimulacroId_qrToken: { physicalSimulacroId: simulacro.id, qrToken } }
    });

    if (existingByQr) {
      const existingErrors = Array.isArray(existingByQr.errors) ? existingByQr.errors : [];
      await prisma.physicalAnswerSheet.update({
        where: { id: existingByQr.id },
        data: {
          status: 'duplicate',
          errors: [...existingErrors, { type: 'DUPLICATE_QR', message: 'Duplicate QR upload detected' }]
        }
      });
      continue;
    }

    const extractedStudentUserId = extractStudentIdFromQr(qr);

    if (!extractedStudentUserId) {
      await prisma.physicalAnswerSheet.create({
        data: {
          physicalSimulacroId: simulacro.id,
          studentId: user.id,
          qrToken,
          rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
          parsedAnswers: [],
          status: 'invalid',
          errors: [{ type: 'MISSING_STUDENT', message: 'Student not found in QR token' }],
          processedAt: new Date()
        }
      });
      continue;
    }

    // Verify student exists as a User
    const studentUser = await prisma.user.findUnique({ where: { id: extractedStudentUserId }, select: { id: true } });
    if (!studentUser) {
      await prisma.physicalAnswerSheet.create({
        data: {
          physicalSimulacroId: simulacro.id,
          studentId: user.id,
          qrToken,
          rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
          parsedAnswers: [],
          status: 'invalid',
          errors: [{ type: 'MISSING_STUDENT', message: 'Student user not found' }],
          processedAt: new Date()
        }
      });
      continue;
    }

    const studentCourse = await ensureStudentInSimulacroCourses({
      studentUserId: extractedStudentUserId,
      simulacroId: simulacro.id
    });

    if (!studentCourse) {
      await prisma.physicalAnswerSheet.create({
        data: {
          physicalSimulacroId: simulacro.id,
          studentId: extractedStudentUserId,
          qrToken,
          rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
          parsedAnswers: [],
          status: 'invalid',
          errors: [{ type: 'STUDENT_NOT_IN_COURSE', message: 'Student does not belong to assigned courses' }],
          processedAt: new Date()
        }
      });
      continue;
    }

    const evaluated = evaluateAnswerSheet({ sheet: page, answerKey: simulacro.answerKey, thetaCalculator });
    const modelStatus = page.flags?.includes('LOW_CONFIDENCE') ? 'needsReview' : evaluated.status;

    const createdSheet = await prisma.physicalAnswerSheet.create({
      data: {
        physicalSimulacroId: simulacro.id,
        studentId: extractedStudentUserId,
        qrToken,
        rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        parsedAnswers: evaluated.parsedAnswers,
        score: evaluated.rawScore,
        theta: evaluated.theta,
        status: modelStatus,
        errors: [
          ...(evaluated.errors || []),
          ...(page.flags || []).map((flag) => ({ type: flag, message: `OMR flag: ${flag}` }))
        ],
        detectionConfidence: page.detectionConfidence,
        processedAt: new Date()
      }
    });

    // Transition result visibility status based on detection confidence
    const conf = Number(page.detectionConfidence || 0);
    const resultTarget = conf < RESULT_STATUS_CONFIDENCE_THRESHOLD ? 'REVIEW_REQUIRED' : 'PROCESSED';
    const reviewReason = resultTarget === 'REVIEW_REQUIRED'
      ? `Confianza de detección ${conf.toFixed(2)} < ${RESULT_STATUS_CONFIDENCE_THRESHOLD}`
      : null;

    await transitionStatus({
      sheetId: createdSheet.id,
      tenantId: simulacro.schoolId,
      toStatus: resultTarget,
      changedBy: 'system',
      reason: reviewReason
    });
  }

  await prisma.physicalSimulacro.update({ where: { id: simulacro.id }, data: { status: 'reviewing' } });
};

const uploadTeacherOcrSheets = async ({ user, simulacroId, files, pagePayloadsByFileName }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  if (!Array.isArray(files) || files.length === 0) {
    throw new ApiError(400, 'ValidationError', ['At least one file is required']);
  }

  if (!['readyForUpload', 'processing', 'reviewing'].includes(simulacro.status)) {
    throw new ApiError(400, 'ValidationError', [`Cannot upload sheets while simulacro status is ${simulacro.status}`]);
  }

  const thetaCalculator = buildThetaCalculator(simulacro.answerKey);

  await prisma.physicalSimulacro.update({ where: { id: simulacro.id }, data: { status: 'processing' } });

  const jobs = files.map((file) => {
    const fileName = path.basename(file.originalname || file.filename);
    const pagePayloads = pagePayloadsByFileName?.[fileName] || pagePayloadsByFileName?.default || null;
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    ocrQueue
      .enqueue(() => processUploadedFileJob({ user, simulacro, file, pagePayloads, thetaCalculator }))
      .then(async () => {
        await logAudit({ schoolId: simulacro.schoolId, userId: user.id, action: 'upload', entityType: 'PhysicalSimulacro', entityId: simulacro.id, metadata: { fileName, jobId } });
      })
      .catch(async (error) => {
        await logAudit({ schoolId: simulacro.schoolId, userId: user.id, action: 'upload_failed', entityType: 'PhysicalSimulacro', entityId: simulacro.id, metadata: { fileName, jobId, error: error.message } });
      });

    return { jobId, fileName, status: 'queued' };
  });

  return { queuedJobs: jobs, totalQueued: jobs.length };
};

const recalculateSheetScore = ({ simulacro, sheet }) => {
  const thetaCalculator = buildThetaCalculator(simulacro.answerKey);
  return evaluateAnswerSheet({ sheet: { answers: sheet.parsedAnswers }, answerKey: simulacro.answerKey, thetaCalculator });
};

const reviewTeacherOcrSheet = async ({ user, simulacroId, payload }) => {
  const validation = validateReviewPayload(payload);
  if (validation.errors) throw new ApiError(400, 'ValidationError', validation.errors);

  const simulacro = await ensureTeacherAccess({ simulacroId, user });
  const { sheetId, corrections } = validation.value;

  const sheet = await prisma.physicalAnswerSheet.findFirst({
    where: { id: sheetId, physicalSimulacroId: simulacro.id }
  });
  if (!sheet) throw new ApiError(404, 'NotFound', ['Sheet not found']);

  const answerMap = new Map(
    ((sheet.parsedAnswers || [])).map((row) => [Number(row.questionNumber), row])
  );

  corrections.forEach((correction) => {
    const current = answerMap.get(correction.questionNumber) || { questionNumber: correction.questionNumber, confidence: 1 };
    answerMap.set(correction.questionNumber, { ...current, markedOption: correction.correctedOption, confidence: 1 });
  });

  const updatedParsedAnswers = Array.from(answerMap.values()).sort((a, b) => a.questionNumber - b.questionNumber);
  const updatedManualCorrections = [...(Array.isArray(sheet.manualCorrections) ? sheet.manualCorrections : []), ...corrections];

  const mockSheet = { parsedAnswers: updatedParsedAnswers };
  const recalculated = recalculateSheetScore({ simulacro, sheet: mockSheet });

  const updated = await prisma.physicalAnswerSheet.update({
    where: { id: sheet.id },
    data: {
      parsedAnswers: updatedParsedAnswers,
      manualCorrections: updatedManualCorrections,
      score: recalculated.rawScore,
      theta: recalculated.theta,
      errors: [],
      status: 'valid',
      processedAt: new Date()
    }
  });

  await Promise.all([
    logAudit({ schoolId: simulacro.schoolId, userId: user.id, action: 'manualCorrection', entityType: 'PhysicalAnswerSheet', entityId: sheet.id, metadata: { simulacroId: simulacro.id, corrections } }),
    logAudit({ schoolId: simulacro.schoolId, userId: user.id, action: 'review', entityType: 'PhysicalSimulacro', entityId: simulacro.id, metadata: { sheetId: sheet.id, correctionsCount: corrections.length } })
  ]);

  return updated;
};

const buildEvaluationFromSheet = ({ simulacro, sheet }) => {
  const keyMap = new Map((simulacro.answerKey || []).map((row) => [row.questionNumber, row.correctOption]));

  const responses = ((sheet.parsedAnswers || [])).map((row) => {
    const correctAnswer = keyMap.get(row.questionNumber) || null;
    const selected = row.markedOption || null;
    return {
      selectedOption: selected,
      status: selected ? 'valid' : 'blank',
      correctAnswer,
      isCorrect: Boolean(selected && correctAnswer && selected === correctAnswer)
    };
  });

  const theta = Number(sheet.theta || 0);
  const globalScore = Number((Number(sheet.score || 0) * (500 / Math.max(simulacro.totalQuestions, 1))).toFixed(0));
  const percentile = Math.max(1, Math.min(99, Math.round(((theta + 3) / 6) * 100)));

  return { responses, theta, globalScore, percentile };
};

const publishTeacherOcrResults = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const pendingCount = await prisma.physicalAnswerSheet.count({
    where: { physicalSimulacroId: simulacro.id, status: 'needsReview' }
  });
  if (pendingCount > 0) {
    throw new ApiError(400, 'ValidationError', ['Cannot publish with pending reviews']);
  }

  const sheets = await prisma.physicalAnswerSheet.findMany({
    where: { physicalSimulacroId: simulacro.id, status: { in: ['valid', 'invalid'] } },
    select: { id: true, studentId: true, parsedAnswers: true, score: true, theta: true, rawFilePath: true, status: true }
  });

  for (const sheet of sheets) {
    const evaluationData = buildEvaluationFromSheet({ simulacro, sheet });

    // Upsert-like: find existing evaluation then create or update
    const existingEval = await prisma.evaluation.findFirst({
      where: { studentId: sheet.studentId, physicalSimulacroId: simulacro.id, evaluationType: 'physical' }
    });

    if (existingEval) {
      await prisma.evaluationResponse.deleteMany({ where: { evaluationId: existingEval.id } });
      await prisma.evaluation.update({
        where: { id: existingEval.id },
        data: {
          status: 'completed',
          theta: evaluationData.theta,
          globalScore: evaluationData.globalScore,
          percentile: evaluationData.percentile,
          physicalRawScore: Number(sheet.score || 0),
          physicalPercentCorrect: Number(((Number(sheet.score || 0) / Math.max(simulacro.totalQuestions, 1)) * 100).toFixed(2)),
          physicalCompetencyBreakdown: [],
          physicalScannedSheetPath: sheet.rawFilePath || '',
          completedAt: new Date(),
          responses: { create: evaluationData.responses.map((r) => ({ ...r, questionId: r.questionId || 'unknown' })) }
        }
      });
    } else {
      await prisma.evaluation.create({
        data: {
          studentId: sheet.studentId,
          physicalSimulacroId: simulacro.id,
          evaluationType: 'physical',
          status: 'completed',
          theta: evaluationData.theta,
          globalScore: evaluationData.globalScore,
          percentile: evaluationData.percentile,
          physicalRawScore: Number(sheet.score || 0),
          physicalPercentCorrect: Number(((Number(sheet.score || 0) / Math.max(simulacro.totalQuestions, 1)) * 100).toFixed(2)),
          physicalCompetencyBreakdown: [],
          physicalScannedSheetPath: sheet.rawFilePath || '',
          startedAt: new Date(),
          completedAt: new Date()
        }
      });
    }

    // Upsert StudentProgress + create ThetaHistory entry
    const progress = await prisma.studentProgress.upsert({
      where: { studentId: sheet.studentId },
      create: {
        studentId: sheet.studentId,
        schoolId: simulacro.schoolId,
        currentTheta: evaluationData.theta,
        percentile: evaluationData.percentile,
        ultimoSimulacro: new Date(),
        simulacrosCompletados: 1
      },
      update: {
        currentTheta: evaluationData.theta,
        percentile: evaluationData.percentile,
        ultimoSimulacro: new Date(),
        simulacrosCompletados: { increment: 1 }
      }
    });

    await prisma.thetaHistory.create({
      data: {
        progressId: progress.id,
        theta: evaluationData.theta,
        globalScore: evaluationData.globalScore
      }
    });
  }

  await prisma.physicalSimulacro.update({
    where: { id: simulacro.id },
    data: { status: 'published', publishedAt: new Date() }
  });

  await logAudit({
    schoolId: simulacro.schoolId,
    userId: user.id,
    action: 'publish',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro.id,
    metadata: { totalSheets: sheets.length }
  });

  return { publishedSheets: sheets.length, pendingReviews: 0 };
};

const archiveTeacherOcrSimulacro = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const threshold = new Date(Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const sheets = await prisma.physicalAnswerSheet.findMany({
    where: { physicalSimulacroId: simulacro.id },
    select: { id: true, rawFilePath: true, createdAt: true }
  });

  let deletedFiles = 0;

  for (const sheet of sheets) {
    if (sheet.rawFilePath && new Date(sheet.createdAt) <= threshold) {
      await ensureSafePathForDelete(sheet.rawFilePath);
      deletedFiles += 1;
      await prisma.physicalAnswerSheet.update({ where: { id: sheet.id }, data: { rawFilePath: '' } });
    }
  }

  await prisma.physicalSimulacro.update({
    where: { id: simulacro.id },
    data: { status: 'archived', archivedAt: new Date() }
  });

  await logAudit({
    schoolId: simulacro.schoolId,
    userId: user.id,
    action: 'archive',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro.id,
    metadata: { retentionDays: FILE_RETENTION_DAYS, deletedFiles }
  });

  return { archivedAt: new Date(), deletedFiles, retentionDays: FILE_RETENTION_DAYS };
};

const generateSimulacroSheets = async ({ simulacroId, user, ip, userAgent }) => {
  const whereClause = {
    id: simulacroId,
    schoolId: user.schoolId,
    ...(user.role !== 'admin' ? { teacherId: user.id } : {})
  };

  const simulacro = await prisma.physicalSimulacro.findFirst({
    where: whereClause,
    include: {
      courses: {
        include: {
          enrollments: {
            include: {
              student: {
                include: { user: { select: { id: true, name: true } } }
              }
            }
          }
        }
      }
    }
  });

  if (!simulacro) throw new ApiError(404, 'NotFound', ['Simulacro no encontrado o sin acceso']);

  if (!['draft', 'answerKeyPending', 'readyForUpload'].includes(simulacro.status)) {
    throw new ApiError(400, 'ValidationError', [`No se pueden generar PDFs con estado: ${simulacro.status}`]);
  }

  // De-duplicate students across courses (a student may be enrolled in multiple courses)
  const studentMap = new Map();
  for (const course of simulacro.courses) {
    for (const enrollment of course.enrollments) {
      const userId = enrollment.student.userId;
      if (!studentMap.has(userId)) {
        studentMap.set(userId, {
          studentId: userId,
          studentName: enrollment.student.user.name,
          studentDocument: enrollment.student.identificationNumber || '',
          courseName: course.name
        });
      }
    }
  }

  if (!studentMap.size) {
    throw new ApiError(400, 'ValidationError', ['No hay estudiantes matriculados en este simulacro']);
  }

  const studentsForPdf = [];
  const issuanceMeta = [];

  for (const [, studentData] of studentMap) {
    const qrToken = generateQRToken({
      studentId: studentData.studentId,
      simulacroId: simulacro.id,
      tenantId: simulacro.schoolId
    });
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);

    studentsForPdf.push({ ...studentData, qrPayload: qrToken });
    issuanceMeta.push({ ...studentData, qrToken, expiresAt });
  }

  const simulacroForPdf = {
    simulacroPhysicalId: simulacro.id,
    questionCount: simulacro.totalQuestions,
    date: simulacro.date
  };

  const { studentPackages } = await generateStudentDocuments({
    simulacro: simulacroForPdf,
    students: studentsForPdf,
    questions: []
  });

  const results = [];

  for (let i = 0; i < issuanceMeta.length; i++) {
    const meta = issuanceMeta[i];
    const pkg = studentPackages[i];

    let pdfHash = null;
    try {
      const omrAbsPath = path.join(process.cwd(), pkg.omrPdfPath.replace(/^\//, ''));
      const omrBuffer = await fs.readFile(omrAbsPath);
      pdfHash = crypto.createHash('sha256').update(omrBuffer).digest('hex');
    } catch (_err) {
      // non-fatal
    }

    const qrTokenHash = crypto.createHash('sha256').update(meta.qrToken).digest('hex');

    await prisma.physicalStudentIssuance.upsert({
      where: {
        physicalSimulacroId_studentId: {
          physicalSimulacroId: simulacro.id,
          studentId: meta.studentId
        }
      },
      create: {
        physicalSimulacroId: simulacro.id,
        studentId: meta.studentId,
        qrToken: meta.qrToken,
        expiresAt: meta.expiresAt,
        pdfHash,
        pdfTemplateVersion: 'v1'
      },
      update: {
        qrToken: meta.qrToken,
        qrGeneratedAt: new Date(),
        expiresAt: meta.expiresAt,
        pdfHash,
        pdfTemplateVersion: 'v1'
      }
    });

    await prisma.qRAuditLog.create({
      data: {
        schoolId: simulacro.schoolId,
        simulacroId: simulacro.id,
        studentId: meta.studentId,
        qrTokenHash,
        action: 'GENERATED',
        ip: ip || null,
        userAgent: userAgent || null
      }
    });

    results.push({ ...pkg, pdfHash });
  }

  await logAudit({
    schoolId: simulacro.schoolId,
    userId: user.id,
    action: 'generate_pdfs',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro.id,
    metadata: { totalStudents: results.length }
  });

  return {
    simulacroId: simulacro.id,
    totalStudents: results.length,
    studentPackages: results.map((pkg) => ({
      studentId: pkg.studentId,
      studentName: pkg.studentName,
      examPdfPath: pkg.examPdfPath,
      omrPdfPath: pkg.omrPdfPath,
      pdfHash: pkg.pdfHash
    }))
  };
};

module.exports = {
  createAdminPhysicalSimulacro,
  listTeacherOcrSimulacros,
  getTeacherOcrSimulacroDetail,
  uploadTeacherOcrSheets,
  reviewTeacherOcrSheet,
  publishTeacherOcrResults,
  archiveTeacherOcrSimulacro,
  generateSimulacroSheets
};
