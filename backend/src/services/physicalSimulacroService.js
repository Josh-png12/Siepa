const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const PhysicalSimulacro = require('../models/PhysicalSimulacro');
const PhysicalAnswerSheet = require('../models/PhysicalAnswerSheet');
const Course = require('../models/Course');
const User = require('../models/User');
const Evaluation = require('../models/Evaluation');
const StudentProgress = require('../models/StudentProgress');
const { parsePDF, evaluateAnswerSheet } = require('./omrService');
const { estimateTheta } = require('./triService');
const ocrQueue = require('./ocrProcessingQueue');
const { logAudit } = require('./auditLogService');
const { parsePagination } = require('../validators/ocrValidators');
const {
  validateCreatePhysicalSimulacroPayload,
  validateReviewPayload
} = require('../validators/physicalSimulacroValidators');
const { isObjectId } = require('../validators/commonValidators');

const OCR_REVIEW_WINDOW_DAYS = Number(process.env.OCR_REVIEW_WINDOW_DAYS || 7);
const FILE_RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS || 14);

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const ensureTeacherAccess = async ({ simulacroId, user }) => {
  if (!isObjectId(simulacroId)) throw new ApiError(400, 'ValidationError', ['Invalid simulacro id']);

  const where = { _id: simulacroId };
  if (user.role !== 'admin') where.teacher = user.id;

  const simulacro = await PhysicalSimulacro.findOne(where).lean();
  if (!simulacro) throw new ApiError(404, 'NotFound', ['Physical simulacro not found or no access']);

  return simulacro;
};

const ensureStudentInSimulacroCourses = async ({ studentId, simulacro }) => {
  const course = await Course.findOne({
    _id: { $in: simulacro.courses },
    students: studentId
  })
    .select('_id name')
    .lean();

  return course;
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

const computeExpectedStudents = async (courseIds) => {
  const courses = await Course.find({ _id: { $in: courseIds } })
    .select('students')
    .lean();

  const unique = new Set(courses.flatMap((course) => (course.students || []).map((id) => String(id))));
  return unique.size;
};

const createAdminPhysicalSimulacro = async ({ userId, payload }) => {
  const validation = validateCreatePhysicalSimulacroPayload(payload);
  if (validation.errors) throw new ApiError(400, 'ValidationError', validation.errors);

  const data = validation.value;

  const teacher = await User.findOne({ _id: data.teacher, role: 'docente' })
    .select('_id features.physicalSimulacros')
    .lean();
  if (!teacher) throw new ApiError(404, 'NotFound', ['Teacher not found']);

  const courses = await Course.find({ _id: { $in: data.courses } })
    .select('_id teacher')
    .lean();

  if (courses.length !== data.courses.length) {
    throw new ApiError(404, 'NotFound', ['One or more courses not found']);
  }

  const unauthorized = courses.find((course) => String(course.teacher) !== String(data.teacher));
  if (unauthorized) {
    throw new ApiError(403, 'Forbidden', ['All courses must belong to assigned teacher']);
  }

  const reviewDeadline = new Date(data.date);
  reviewDeadline.setDate(reviewDeadline.getDate() + data.reviewWindowDays);

  const status = data.answerKey.length === data.totalQuestions ? 'readyForUpload' : 'answerKeyPending';

  const simulacro = await PhysicalSimulacro.create({
    title: data.title,
    description: data.description,
    teacher: data.teacher,
    courses: data.courses,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    status,
    totalQuestions: data.totalQuestions,
    answerKey: data.answerKey,
    reviewDeadline
  });

  await logAudit({
    userId,
    action: 'create',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro._id,
    metadata: {
      status,
      teacher: data.teacher,
      totalQuestions: data.totalQuestions
    }
  });

  const populated = await PhysicalSimulacro.findById(simulacro._id)
    .populate('teacher', 'name email')
    .populate('courses', 'name grade year')
    .lean();

  return populated;
};

const buildTeacherSimulacroStats = async (simulacroIds, courseIdsBySimulacro) => {
  const [sheetStats, scoreStats] = await Promise.all([
    PhysicalAnswerSheet.aggregate([
      { $match: { simulacroId: { $in: simulacroIds } } },
      {
        $group: {
          _id: '$simulacroId',
          sheetsReceived: { $sum: 1 },
          sheetsPendingReview: {
            $sum: { $cond: [{ $eq: ['$status', 'needsReview'] }, 1, 0] }
          },
          duplicatesDetected: {
            $sum: { $cond: [{ $eq: ['$status', 'duplicate'] }, 1, 0] }
          }
        }
      }
    ]),
    PhysicalAnswerSheet.aggregate([
      {
        $match: {
          simulacroId: { $in: simulacroIds },
          score: { $ne: null },
          status: { $in: ['valid', 'needsReview', 'invalid'] }
        }
      },
      {
        $group: {
          _id: '$simulacroId',
          averageScore: { $avg: '$score' }
        }
      }
    ])
  ]);

  const sheetMap = new Map(sheetStats.map((row) => [String(row._id), row]));
  const scoreMap = new Map(scoreStats.map((row) => [String(row._id), row]));

  const expectedMap = new Map();
  await Promise.all(
    Array.from(courseIdsBySimulacro.entries()).map(async ([simulacroId, courseIds]) => {
      expectedMap.set(simulacroId, await computeExpectedStudents(courseIds));
    })
  );

  return { sheetMap, scoreMap, expectedMap };
};

const listTeacherOcrSimulacros = async ({ user, query }) => {
  const { page, limit, skip } = parsePagination(query);

  const where = { teacher: user.id };
  if (query.status) where.status = query.status;

  const [total, items] = await Promise.all([
    PhysicalSimulacro.countDocuments(where),
    PhysicalSimulacro.find(where)
      .select('title date status courses reviewDeadline')
      .populate('courses', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  const simulacroIds = items.map((item) => item._id);
  const courseIdsBySimulacro = new Map(
    items.map((item) => [String(item._id), (item.courses || []).map((course) => course._id)])
  );

  const { sheetMap, scoreMap, expectedMap } = await buildTeacherSimulacroStats(simulacroIds, courseIdsBySimulacro);

  const rows = items.map((item) => {
    const key = String(item._id);
    const sheets = sheetMap.get(key) || {};
    const score = scoreMap.get(key) || {};

    return {
      id: item._id,
      title: item.title,
      date: item.date,
      status: item.status,
      courseName: (item.courses || []).map((course) => course.name).join(', '),
      expectedStudents: expectedMap.get(key) || 0,
      sheetsReceived: sheets.sheetsReceived || 0,
      sheetsPendingReview: sheets.sheetsPendingReview || 0,
      duplicatesDetected: sheets.duplicatesDetected || 0,
      averageScore: Number((score.averageScore || 0).toFixed(2))
    };
  });

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

const getTeacherOcrSimulacroDetail = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const [sheets, expectedStudents, courses] = await Promise.all([
    PhysicalAnswerSheet.find({ simulacroId: simulacro._id })
      .select('studentId qrToken score theta status errors parsedAnswers rawFilePath manualCorrections processedAt')
      .populate('studentId', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    computeExpectedStudents(simulacro.courses),
    Course.find({ _id: { $in: simulacro.courses } }).select('name').lean()
  ]);

  const summary = {
    id: simulacro._id,
    title: simulacro.title,
    date: simulacro.date,
    status: simulacro.status,
    course: courses.map((course) => course.name).join(', '),
    studentsExpected: expectedStudents,
    sheetsReceived: sheets.length,
    sheetsWithErrors: sheets.filter((sheet) => (sheet.errors || []).length > 0 || sheet.status === 'needsReview').length
  };

  const mappedSheets = sheets.map((sheet) => ({
    id: sheet._id,
    studentId: sheet.studentId?._id,
    studentName: sheet.studentId?.name || 'Unknown',
    studentEmail: sheet.studentId?.email || '',
    qrToken: sheet.qrToken,
    status: sheet.status,
    score: sheet.score,
    theta: sheet.theta,
    validAnswers: (sheet.parsedAnswers || []).filter((row) => row.markedOption).length,
    errors: (sheet.errors || []).length,
    parsedResponses: sheet.parsedAnswers,
    manualCorrections: sheet.manualCorrections,
    processedAt: sheet.processedAt,
    previewUrl: sheet.rawFilePath ? `/${String(sheet.rawFilePath).replace(/^\/+/, '')}` : null
  }));

  return {
    summary,
    sheets: mappedSheets
  };
};

const extractStudentIdFromQr = (qr) => {
  if (!qr) return null;
  return qr.studentId || qr.studentID || null;
};

const ensureSimulacroIdMatch = ({ qr, simulacro }) => {
  const qrSimulacroId = qr?.simulacroId || qr?.simulacroPhysicalID || qr?.simulacroPhysicalId || null;
  if (!qrSimulacroId) return false;

  return String(qrSimulacroId) === String(simulacro._id) || String(qrSimulacroId) === String(simulacro.id || '');
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

const processUploadedFileJob = async ({
  user,
  simulacro,
  file,
  pagePayloads,
  thetaCalculator
}) => {
  const parsed = await parsePDF(file.path, {
    pagePayloads,
    totalQuestions: simulacro.totalQuestions
  });

  for (const page of parsed.pages) {
    const qrToken = String(page.qrToken || '').trim();
    const qr = page.qr;

    if (!qrToken) {
      await PhysicalAnswerSheet.create({
        simulacroId: simulacro._id,
        studentId: user.id,
        qrToken: `missing-qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        parsedAnswers: [],
        status: 'invalid',
        errors: [{ type: 'MISSING_QR', message: 'QR not detected' }],
        processedAt: new Date()
      });
      continue;
    }

    const existingByQr = await PhysicalAnswerSheet.findOne({ simulacroId: simulacro._id, qrToken }).lean();
    if (existingByQr) {
      await PhysicalAnswerSheet.findByIdAndUpdate(existingByQr._id, {
        $set: { status: 'duplicate' },
        $push: { errors: { type: 'DUPLICATE_QR', message: 'Duplicate QR upload detected' } }
      });

      continue;
    }

    const extractedStudentId = extractStudentIdFromQr(qr);

    if (!extractedStudentId || !isObjectId(extractedStudentId)) {
      await PhysicalAnswerSheet.create({
        simulacroId: simulacro._id,
        studentId: user.id,
        qrToken,
        rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        parsedAnswers: [],
        status: 'invalid',
        errors: [{ type: 'MISSING_STUDENT', message: 'Student not found in QR token' }],
        processedAt: new Date()
      });
      continue;
    }

    const studentCourse = await ensureStudentInSimulacroCourses({
      studentId: extractedStudentId,
      simulacro
    });

    if (!studentCourse) {
      await PhysicalAnswerSheet.create({
        simulacroId: simulacro._id,
        studentId: extractedStudentId,
        qrToken,
        rawFilePath: path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
        parsedAnswers: [],
        status: 'invalid',
        errors: [{ type: 'STUDENT_NOT_IN_COURSE', message: 'Student does not belong to assigned courses' }],
        processedAt: new Date()
      });
      continue;
    }

    const evaluated = evaluateAnswerSheet({
      sheet: page,
      answerKey: simulacro.answerKey,
      thetaCalculator
    });

    const modelStatus = page.flags?.includes('LOW_CONFIDENCE')
      ? 'needsReview'
      : evaluated.status;

    await PhysicalAnswerSheet.create({
      simulacroId: simulacro._id,
      studentId: extractedStudentId,
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
    });
  }

  await PhysicalSimulacro.findByIdAndUpdate(simulacro._id, {
    $set: {
      status: 'reviewing'
    }
  });
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

  await PhysicalSimulacro.findByIdAndUpdate(simulacro._id, { $set: { status: 'processing' } });

  const jobs = files.map((file) => {
    const fileName = path.basename(file.originalname || file.filename);
    const pagePayloads = pagePayloadsByFileName?.[fileName] || pagePayloadsByFileName?.default || null;

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    ocrQueue
      .enqueue(() => processUploadedFileJob({ user, simulacro, file, pagePayloads, thetaCalculator }))
      .then(async () => {
        await logAudit({
          userId: user.id,
          action: 'upload',
          entityType: 'PhysicalSimulacro',
          entityId: simulacro._id,
          metadata: { fileName, jobId }
        });
      })
      .catch(async (error) => {
        await logAudit({
          userId: user.id,
          action: 'upload_failed',
          entityType: 'PhysicalSimulacro',
          entityId: simulacro._id,
          metadata: { fileName, jobId, error: error.message }
        });
      });

    return {
      jobId,
      fileName,
      status: 'queued'
    };
  });

  return {
    queuedJobs: jobs,
    totalQueued: jobs.length
  };
};

const recalculateSheetScore = ({ simulacro, sheet }) => {
  const thetaCalculator = buildThetaCalculator(simulacro.answerKey);
  return evaluateAnswerSheet({
    sheet: {
      answers: sheet.parsedAnswers
    },
    answerKey: simulacro.answerKey,
    thetaCalculator
  });
};

const reviewTeacherOcrSheet = async ({ user, simulacroId, payload }) => {
  const validation = validateReviewPayload(payload);
  if (validation.errors) throw new ApiError(400, 'ValidationError', validation.errors);

  const simulacro = await ensureTeacherAccess({ simulacroId, user });
  const { sheetId, corrections } = validation.value;

  const sheet = await PhysicalAnswerSheet.findOne({ _id: sheetId, simulacroId: simulacro._id });
  if (!sheet) throw new ApiError(404, 'NotFound', ['Sheet not found']);

  const answerMap = new Map((sheet.parsedAnswers || []).map((row) => [Number(row.questionNumber), row]));

  corrections.forEach((correction) => {
    const current = answerMap.get(correction.questionNumber) || { questionNumber: correction.questionNumber, confidence: 1 };
    answerMap.set(correction.questionNumber, {
      ...current,
      markedOption: correction.correctedOption,
      confidence: 1
    });
  });

  sheet.parsedAnswers = Array.from(answerMap.values()).sort((a, b) => a.questionNumber - b.questionNumber);
  sheet.manualCorrections = [...(sheet.manualCorrections || []), ...corrections];

  const recalculated = recalculateSheetScore({ simulacro, sheet });
  sheet.score = recalculated.rawScore;
  sheet.theta = recalculated.theta;
  sheet.errors = [];
  sheet.status = 'valid';
  sheet.processedAt = new Date();

  await sheet.save();

  await logAudit({
    userId: user.id,
    action: 'manualCorrection',
    entityType: 'PhysicalAnswerSheet',
    entityId: sheet._id,
    metadata: { simulacroId: simulacro._id, corrections }
  });

  await logAudit({
    userId: user.id,
    action: 'review',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro._id,
    metadata: { sheetId: sheet._id, correctionsCount: corrections.length }
  });

  return sheet.toObject();
};

const buildEvaluationFromSheet = ({ simulacro, sheet }) => {
  const keyMap = new Map((simulacro.answerKey || []).map((row) => [row.questionNumber, row.correctOption]));

  const responses = (sheet.parsedAnswers || []).map((row) => {
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
  const globalScore = Number((sheet.score || 0) * (500 / Math.max(simulacro.totalQuestions, 1))).toFixed(0);
  const percentile = Math.max(1, Math.min(99, Math.round(((theta + 3) / 6) * 100)));

  return {
    responses,
    theta,
    globalScore: Number(globalScore),
    percentile
  };
};

const publishTeacherOcrResults = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const pendingCount = await PhysicalAnswerSheet.countDocuments({
    simulacroId: simulacro._id,
    status: 'needsReview'
  });

  if (pendingCount > 0) {
    throw new ApiError(400, 'ValidationError', ['Cannot publish with pending reviews']);
  }

  const sheets = await PhysicalAnswerSheet.find({
    simulacroId: simulacro._id,
    status: { $in: ['valid', 'invalid'] }
  })
    .select('studentId parsedAnswers score theta rawFilePath status')
    .lean();

  for (const sheet of sheets) {
    const evaluationData = buildEvaluationFromSheet({ simulacro, sheet });

    await Evaluation.findOneAndUpdate(
      {
        student: sheet.studentId,
        physicalSimulacro: simulacro._id,
        evaluationType: 'physical'
      },
      {
        $set: {
          student: sheet.studentId,
          physicalSimulacro: simulacro._id,
          evaluationType: 'physical',
          status: 'completed',
          theta: evaluationData.theta,
          globalScore: evaluationData.globalScore,
          percentile: evaluationData.percentile,
          responses: evaluationData.responses,
          completedAt: new Date(),
          physicalMeta: {
            rawScore: Number(sheet.score || 0),
            percentCorrect: Number(((Number(sheet.score || 0) / Math.max(simulacro.totalQuestions, 1)) * 100).toFixed(2)),
            competencyBreakdown: [],
            scannedSheetPath: sheet.rawFilePath || ''
          }
        },
        $setOnInsert: {
          startedAt: new Date(),
          booklet: null
        }
      },
      { upsert: true }
    );

    await StudentProgress.findOneAndUpdate(
      { student: sheet.studentId },
      {
        $set: { currentTheta: evaluationData.theta, percentile: evaluationData.percentile, ultimoSimulacro: new Date() },
        $inc: { simulacrosCompletados: 1 },
        $push: {
          historialTheta: {
            date: new Date(),
            theta: evaluationData.theta,
            globalScore: evaluationData.globalScore
          }
        }
      },
      { upsert: true }
    );
  }

  await PhysicalSimulacro.findByIdAndUpdate(simulacro._id, {
    $set: {
      status: 'published',
      publishedAt: new Date()
    }
  });

  await logAudit({
    userId: user.id,
    action: 'publish',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro._id,
    metadata: { totalSheets: sheets.length }
  });

  return {
    publishedSheets: sheets.length,
    pendingReviews: 0
  };
};

const archiveTeacherOcrSimulacro = async ({ user, simulacroId }) => {
  const simulacro = await ensureTeacherAccess({ simulacroId, user });

  const threshold = new Date(Date.now() - FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const sheets = await PhysicalAnswerSheet.find({ simulacroId: simulacro._id })
    .select('_id rawFilePath createdAt')
    .lean();

  let deletedFiles = 0;

  for (const sheet of sheets) {
    if (sheet.rawFilePath && new Date(sheet.createdAt) <= threshold) {
      await ensureSafePathForDelete(sheet.rawFilePath);
      deletedFiles += 1;
      await PhysicalAnswerSheet.findByIdAndUpdate(sheet._id, { $set: { rawFilePath: '' } });
    }
  }

  await PhysicalSimulacro.findByIdAndUpdate(simulacro._id, {
    $set: {
      status: 'archived',
      archivedAt: new Date()
    }
  });

  await logAudit({
    userId: user.id,
    action: 'archive',
    entityType: 'PhysicalSimulacro',
    entityId: simulacro._id,
    metadata: {
      retentionDays: FILE_RETENTION_DAYS,
      deletedFiles
    }
  });

  return {
    archivedAt: new Date(),
    deletedFiles,
    retentionDays: FILE_RETENTION_DAYS
  };
};

module.exports = {
  createAdminPhysicalSimulacro,
  listTeacherOcrSimulacros,
  getTeacherOcrSimulacroDetail,
  uploadTeacherOcrSheets,
  reviewTeacherOcrSheet,
  publishTeacherOcrResults,
  archiveTeacherOcrSimulacro
};
