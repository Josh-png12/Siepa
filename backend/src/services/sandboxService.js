const crypto = require('crypto');
const path = require('path');
const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');
const { generateQRToken } = require('../utils/qrToken');
const { generateStudentDocuments } = require('./pdfGeneratorService');
const { logAudit } = require('./auditLogService');

const SANDBOX_TOTAL_QUESTIONS = 10;
const SANDBOX_ANSWER = 'A';

const findOrCreateSandboxSimulacro = async ({ schoolId, adminUserId }) => {
  const existing = await prisma.physicalSimulacro.findFirst({
    where: { schoolId, isSandbox: true },
    include: { answerKey: { orderBy: { questionNumber: 'asc' } } }
  });
  if (existing) return existing;

  return prisma.physicalSimulacro.create({
    data: {
      schoolId,
      title: 'Espacio de Prueba (Sandbox)',
      description: 'Simulacro de prueba para administradores. No afecta datos reales de estudiantes.',
      teacherId: adminUserId,
      date: new Date(),
      status: 'readyForUpload',
      isSandbox: true,
      totalQuestions: SANDBOX_TOTAL_QUESTIONS,
      reviewDeadline: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      answerKey: {
        create: Array.from({ length: SANDBOX_TOTAL_QUESTIONS }, (_, i) => ({
          questionNumber: i + 1,
          correctOption: SANDBOX_ANSWER
        }))
      }
    },
    include: { answerKey: { orderBy: { questionNumber: 'asc' } } }
  });
};

const generateTestSheet = async ({ adminUser, studentId }) => {
  const student = await prisma.user.findFirst({
    where: { id: studentId, schoolId: adminUser.schoolId, deletedAt: null },
    select: { id: true, name: true }
  });
  if (!student) throw new ApiError(404, 'NotFound', ['Estudiante no encontrado en este colegio']);

  const sandbox = await findOrCreateSandboxSimulacro({
    schoolId: adminUser.schoolId,
    adminUserId: adminUser.id
  });

  const qrToken = generateQRToken({
    studentId: student.id,
    simulacroId: sandbox.id,
    tenantId: adminUser.schoolId,
    isSandbox: true
  });

  const simulacroForPdf = {
    simulacroPhysicalId: sandbox.id,
    questionCount: sandbox.totalQuestions,
    date: sandbox.date
  };

  const studentForPdf = {
    studentId: student.id,
    studentName: student.name,
    studentDocument: '',
    courseName: 'PRUEBA',
    qrPayload: qrToken
  };

  const { studentPackages } = await generateStudentDocuments({
    simulacro: simulacroForPdf,
    students: [studentForPdf],
    questions: [],
    isSandbox: true
  });

  const pkg = studentPackages[0];

  let pdfHash = null;
  try {
    const { readFile } = require('fs/promises');
    const omrAbsPath = path.join(process.cwd(), pkg.omrPdfPath.replace(/^\//, ''));
    const buf = await readFile(omrAbsPath);
    pdfHash = crypto.createHash('sha256').update(buf).digest('hex');
  } catch (_err) {
    // non-fatal
  }

  await prisma.physicalStudentIssuance.upsert({
    where: {
      physicalSimulacroId_studentId: { physicalSimulacroId: sandbox.id, studentId: student.id }
    },
    create: {
      physicalSimulacroId: sandbox.id,
      studentId: student.id,
      qrToken,
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      pdfHash,
      pdfTemplateVersion: 'sandbox-v1'
    },
    update: {
      qrToken,
      qrGeneratedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      pdfHash
    }
  });

  const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');
  await prisma.qRAuditLog.create({
    data: {
      schoolId: adminUser.schoolId,
      simulacroId: sandbox.id,
      studentId: student.id,
      qrTokenHash,
      action: 'GENERATED'
    }
  }).catch(() => {});

  await logAudit({
    schoolId: adminUser.schoolId,
    userId: adminUser.id,
    action: 'sandbox.generate',
    entityType: 'PhysicalSimulacro',
    entityId: sandbox.id,
    metadata: { studentId: student.id, studentName: student.name }
  });

  return {
    simulacroId: sandbox.id,
    studentId: student.id,
    studentName: student.name,
    omrPdfUrl: pkg.omrPdfPath,
    examPdfUrl: pkg.examPdfPath,
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000)
  };
};

const getSandboxResults = async ({ adminUser, simulacroId }) => {
  const simulacro = await prisma.physicalSimulacro.findFirst({
    where: { id: simulacroId, schoolId: adminUser.schoolId, isSandbox: true }
  });
  if (!simulacro) throw new ApiError(404, 'NotFound', ['Simulacro sandbox no encontrado']);

  const sheets = await prisma.physicalAnswerSheet.findMany({
    where: { physicalSimulacroId: simulacroId, isSandbox: true },
    include: { student: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' }
  });

  return {
    simulacro: {
      id: simulacro.id,
      title: simulacro.title,
      totalQuestions: simulacro.totalQuestions,
      status: simulacro.status
    },
    sheets: sheets.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      studentName: s.student?.name || 'Desconocido',
      status: s.status,
      score: s.score,
      theta: s.theta,
      detectionConfidence: s.detectionConfidence,
      parsedAnswers: s.parsedAnswers,
      errors: s.errors,
      processedAt: s.processedAt,
      createdAt: s.createdAt,
      previewUrl: s.rawFilePath ? `/${String(s.rawFilePath).replace(/^\/+/, '')}` : null
    }))
  };
};

const listSandboxSimulacros = async ({ adminUser }) => {
  const simulacros = await prisma.physicalSimulacro.findMany({
    where: { schoolId: adminUser.schoolId, isSandbox: true },
    orderBy: { createdAt: 'desc' }
  });

  const results = await Promise.all(
    simulacros.map(async (sim) => {
      const count = await prisma.physicalAnswerSheet.count({
        where: { physicalSimulacroId: sim.id, isSandbox: true }
      });
      return { id: sim.id, title: sim.title, totalQuestions: sim.totalQuestions, sheetsProcessed: count };
    })
  );

  return results;
};

module.exports = { generateTestSheet, getSandboxResults, listSandboxSimulacros };
