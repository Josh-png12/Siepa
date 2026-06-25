const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { successResponse } = require('../utils/response');
const service = require('../services/physicalSimulacroService');
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

module.exports = {
  listTeacherOcr,
  getTeacherOcrDetail,
  uploadTeacherOcr,
  reviewTeacherOcr,
  publishTeacherOcr,
  archiveTeacherOcr,
  verifyBubble
};
