const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const service = require('../services/physicalSimulacroService');
const prisma = require('../config/prisma');
const { verifyQRToken } = require('../utils/qrToken');
const { validateUploadPayload } = require('../validators/ocrValidators');

const parsePagePayloads = (payloadRaw) => {
  if (!payloadRaw) return {};
  if (typeof payloadRaw === 'object') return payloadRaw;
  try {
    return JSON.parse(payloadRaw);
  } catch (_error) {
    return {};
  }
};

const listTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.listTeacherOcrSimulacros({ user: req.user, query: req.query });

  return successResponse(res, {
    data: result,
    message: 'OCR simulacros loaded'
  });
});

const getTeacherOcrDetail = asyncHandler(async (req, res) => {
  const result = await service.getTeacherOcrSimulacroDetail({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'OCR simulacro detail loaded'
  });
});

const uploadTeacherOcr = asyncHandler(async (req, res) => {
  const uploadValidation = validateUploadPayload(req.body);
  if (uploadValidation.errors.length) {
    throw new ApiError(400, 'ValidationError', uploadValidation.errors);
  }

  const result = await service.uploadTeacherOcrSheets({
    user: req.user,
    simulacroId: req.params.id,
    files: req.files || [],
    pagePayloadsByFileName: parsePagePayloads(req.body.pagePayloadsByFileName)
  });

  return successResponse(res, {
    statusCode: 202,
    data: result,
    message: 'OCR files queued for processing'
  });
});

const reviewTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.reviewTeacherOcrSheet({
    user: req.user,
    simulacroId: req.params.id,
    payload: req.body
  });

  return successResponse(res, {
    data: result,
    message: 'Manual correction applied'
  });
});

const publishTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.publishTeacherOcrResults({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'OCR results published'
  });
});

const archiveTeacherOcr = asyncHandler(async (req, res) => {
  const result = await service.archiveTeacherOcrSimulacro({
    user: req.user,
    simulacroId: req.params.id
  });

  return successResponse(res, {
    data: result,
    message: 'Physical simulacro archived'
  });
});

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const BUBBLE_PROMPT = '¿Está la burbuja en esta imagen marcada (rellena) o en blanco? Responde solo: MARCADA o BLANCO';

const verifyBubble = asyncHandler(async (req, res) => {
  const { image, mimeType = 'image/png' } = req.body || {};

  if (!image || typeof image !== 'string') {
    throw new ApiError(400, 'ValidationError', ['Se requiere el campo image en base64']);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, 'ConfigError', ['GEMINI_API_KEY no configurada']);
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: BUBBLE_PROMPT },
          { inline_data: { mime_type: String(mimeType), data: image } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 10 }
    })
  });

  if (!geminiRes.ok) {
    const body = await geminiRes.text().catch(() => '');
    throw new ApiError(502, 'GeminiError', [`Gemini ${geminiRes.status}: ${body}`]);
  }

  const data = await geminiRes.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();

  const marked = text.includes('MARCADA');
  const isExact = text === 'MARCADA' || text === 'BLANCO';

  return successResponse(res, {
    data: { marked, confidence: isExact ? 'high' : 'low' },
    message: 'Bubble verification complete'
  });
});

const verifyQR = asyncHandler(async (req, res) => {
  const { qrToken, simulacroId } = req.body || {};

  if (!qrToken || !simulacroId) {
    throw new ApiError(400, 'ValidationError', ['Se requieren qrToken y simulacroId']);
  }

  const serviceKey = req.headers['x-omr-service-key'];
  if (!serviceKey || serviceKey !== process.env.OMR_SERVICE_SECRET) {
    throw new ApiError(401, 'Unauthorized');
  }

  const qrTokenHash = crypto.createHash('sha256').update(String(qrToken)).digest('hex');
  const ip = req.ip || null;
  const userAgent = req.get('user-agent') || null;

  let payload;
  try {
    payload = verifyQRToken(String(qrToken));
  } catch (err) {
    const action = err.message === 'TOKEN_EXPIRED' ? 'EXPIRED' : 'VERIFIED_FAIL';

    // Log failure without exposing reason to caller
    try {
      const simulacro = await prisma.physicalSimulacro.findUnique({
        where: { id: simulacroId },
        select: { schoolId: true }
      });
      if (simulacro) {
        await prisma.qRAuditLog.create({
          data: { schoolId: simulacro.schoolId, simulacroId, qrTokenHash, action, ip, userAgent }
        });
      }
    } catch (_logErr) {
      // non-fatal
    }

    return res.json({ valid: false, error: 'QR inválido' });
  }

  // simulacroId in token must match request
  if (payload.simulacroId !== simulacroId) {
    try {
      const simulacro = await prisma.physicalSimulacro.findUnique({
        where: { id: simulacroId },
        select: { schoolId: true }
      });
      if (simulacro) {
        await prisma.qRAuditLog.create({
          data: { schoolId: simulacro.schoolId, simulacroId, studentId: payload.studentId, qrTokenHash, action: 'VERIFIED_FAIL', ip, userAgent }
        });
      }
    } catch (_logErr) {
      // non-fatal
    }
    return res.json({ valid: false, error: 'QR inválido' });
  }

  // Check for existing processed result (duplicate detection)
  const existing = await prisma.physicalAnswerSheet.findUnique({
    where: { physicalSimulacroId_qrToken: { physicalSimulacroId: simulacroId, qrToken: String(qrToken) } }
  });

  if (existing) {
    return res.json({ valid: false, error: 'Hoja ya procesada' });
  }

  // Resolve student info
  const student = await prisma.user.findUnique({
    where: { id: payload.studentId },
    select: { id: true, name: true }
  });

  if (!student) {
    return res.json({ valid: false, error: 'QR inválido' });
  }

  // Log successful verification
  try {
    await prisma.qRAuditLog.create({
      data: {
        schoolId: payload.tenantId,
        simulacroId,
        studentId: payload.studentId,
        qrTokenHash,
        action: 'VERIFIED_OK',
        ip,
        userAgent
      }
    });
  } catch (_logErr) {
    // non-fatal
  }

  return res.json({
    valid: true,
    studentId: student.id,
    studentName: student.name
  });
});

module.exports = {
  listTeacherOcr,
  getTeacherOcrDetail,
  uploadTeacherOcr,
  reviewTeacherOcr,
  publishTeacherOcr,
  archiveTeacherOcr,
  verifyBubble,
  verifyQR
};
