const prisma = require('../config/prisma');
const ApiError = require('../utils/ApiError');

// Allowed transitions. RELEASED has no outbound edges — it is immutable.
const VALID_TRANSITIONS = {
  PENDING: ['PROCESSED', 'REVIEW_REQUIRED'],
  PROCESSED: ['RELEASED', 'REVIEW_REQUIRED'],
  REVIEW_REQUIRED: ['PROCESSED', 'PENDING'],
  RELEASED: []
};

const RESULT_STATUS_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Atomically transitions a single PhysicalAnswerSheet to a new resultStatus.
 * Validates the transition, enforces tenant scope, and writes a SimulacroStatusLog entry.
 * Throws ApiError for invalid transitions or access violations.
 */
const transitionStatus = async ({ sheetId, tenantId, toStatus, changedBy, reason = null }) => {
  return await prisma.$transaction(async (tx) => {
    const sheet = await tx.physicalAnswerSheet.findUnique({
      where: { id: sheetId },
      select: {
        id: true,
        resultStatus: true,
        studentId: true,
        physicalSimulacroId: true,
        physicalSimulacro: { select: { schoolId: true } }
      }
    });

    if (!sheet) throw new ApiError(404, 'NotFound', ['Hoja no encontrada']);

    if (sheet.physicalSimulacro.schoolId !== tenantId) {
      throw new ApiError(403, 'Forbidden', ['Acceso denegado al tenant']);
    }

    const fromStatus = sheet.resultStatus;
    const allowed = VALID_TRANSITIONS[fromStatus] || [];

    if (!allowed.includes(toStatus)) {
      throw new ApiError(400, 'ValidationError', [
        `Transición inválida: ${fromStatus} → ${toStatus}`
      ]);
    }

    const updateData = { resultStatus: toStatus };
    if (toStatus === 'RELEASED') {
      updateData.releasedAt = new Date();
      updateData.releasedBy = changedBy;
    }
    if (toStatus === 'REVIEW_REQUIRED' && reason) {
      updateData.reviewNote = reason;
    }

    const updated = await tx.physicalAnswerSheet.update({
      where: { id: sheetId },
      data: updateData
    });

    await tx.simulacroStatusLog.create({
      data: {
        tenantId,
        simulacroId: sheet.physicalSimulacroId,
        studentId: sheet.studentId,
        fromStatus,
        toStatus,
        changedBy,
        reason
      }
    });

    return updated;
  });
};

/**
 * Atomically releases all PROCESSED sheets for a simulacro in a single transaction.
 * Optionally filtered to a subset of studentIds.
 * Returns { released, skipped: { pending, review } }.
 */
const releaseAll = async ({ simulacroId, tenantId, changedBy, studentIds = null }) => {
  // Verify tenant owns this simulacro
  const simulacro = await prisma.physicalSimulacro.findFirst({
    where: { id: simulacroId, schoolId: tenantId },
    select: { id: true, schoolId: true }
  });
  if (!simulacro) throw new ApiError(404, 'NotFound', ['Simulacro no encontrado o sin acceso']);

  const baseWhere = {
    physicalSimulacroId: simulacroId,
    physicalSimulacro: { schoolId: tenantId }
  };

  return await prisma.$transaction(async (tx) => {
    const processedWhere = { ...baseWhere, resultStatus: 'PROCESSED' };
    if (studentIds && studentIds.length) {
      processedWhere.studentId = { in: studentIds };
    }

    const toRelease = await tx.physicalAnswerSheet.findMany({
      where: processedWhere,
      select: { id: true, studentId: true, physicalSimulacroId: true }
    });

    const [skippedPending, skippedReview] = await Promise.all([
      tx.physicalAnswerSheet.count({ where: { ...baseWhere, resultStatus: 'PENDING' } }),
      tx.physicalAnswerSheet.count({ where: { ...baseWhere, resultStatus: 'REVIEW_REQUIRED' } })
    ]);

    if (!toRelease.length) {
      return { released: 0, skipped: { pending: skippedPending, review: skippedReview } };
    }

    const releaseAt = new Date();
    const sheetIds = toRelease.map((s) => s.id);

    await tx.physicalAnswerSheet.updateMany({
      where: { id: { in: sheetIds } },
      data: { resultStatus: 'RELEASED', releasedAt: releaseAt, releasedBy: changedBy }
    });

    await tx.simulacroStatusLog.createMany({
      data: toRelease.map((s) => ({
        tenantId,
        simulacroId: s.physicalSimulacroId,
        studentId: s.studentId,
        fromStatus: 'PROCESSED',
        toStatus: 'RELEASED',
        changedBy,
        reason: null
      }))
    });

    return {
      released: toRelease.length,
      skipped: { pending: skippedPending, review: skippedReview }
    };
  });
};

/**
 * Returns the coordinator reconciliation panel for a simulacro.
 * Crosses PhysicalStudentIssuance (expected) with PhysicalAnswerSheet (received).
 */
const getReconciliation = async ({ simulacroId, tenantId }) => {
  const simulacro = await prisma.physicalSimulacro.findFirst({
    where: { id: simulacroId, schoolId: tenantId },
    select: { id: true }
  });
  if (!simulacro) throw new ApiError(404, 'NotFound', ['Simulacro no encontrado o sin acceso']);

  const [issuances, sheets] = await Promise.all([
    prisma.physicalStudentIssuance.findMany({
      where: { physicalSimulacroId: simulacroId },
      include: { student: { select: { id: true, name: true } } }
    }),
    prisma.physicalAnswerSheet.findMany({
      where: {
        physicalSimulacroId: simulacroId,
        physicalSimulacro: { schoolId: tenantId }
      },
      select: {
        studentId: true,
        resultStatus: true,
        reviewNote: true,
        detectionConfidence: true,
        student: { select: { id: true, name: true } }
      }
    })
  ]);

  const sheetMap = new Map(sheets.map((s) => [s.studentId, s]));

  const byStatus = { PENDING: 0, PROCESSED: 0, RELEASED: 0, REVIEW_REQUIRED: 0 };
  const pendingStudents = [];
  const reviewRequired = [];

  // Students with issued PDFs
  const seenIds = new Set();
  for (const issuance of issuances) {
    seenIds.add(issuance.studentId);
    const sheet = sheetMap.get(issuance.studentId);
    if (!sheet) {
      byStatus.PENDING++;
      pendingStudents.push({
        studentId: issuance.studentId,
        name: issuance.student.name,
        status: 'PENDING'
      });
    } else {
      byStatus[sheet.resultStatus] = (byStatus[sheet.resultStatus] || 0) + 1;
      if (sheet.resultStatus === 'REVIEW_REQUIRED') {
        reviewRequired.push({
          studentId: issuance.studentId,
          name: issuance.student.name,
          reviewNote: sheet.reviewNote,
          confidence: sheet.detectionConfidence
        });
      }
    }
  }

  // Sheets for students without issuances (unexpected scans — include in count)
  for (const sheet of sheets) {
    if (!seenIds.has(sheet.studentId)) {
      byStatus[sheet.resultStatus] = (byStatus[sheet.resultStatus] || 0) + 1;
    }
  }

  const total = issuances.length;

  return {
    total,
    byStatus,
    readyToRelease: byStatus.PROCESSED,
    pendingStudents,
    reviewRequired
  };
};

module.exports = {
  transitionStatus,
  releaseAll,
  getReconciliation,
  RESULT_STATUS_CONFIDENCE_THRESHOLD
};
