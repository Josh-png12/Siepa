const ApiError = require('../utils/ApiError');

const VALID_STATUS = ['draft', 'uploaded', 'extracting', 'parsing', 'previewReady', 'confirmed', 'failed'];
const VALID_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];
const VALID_NIVEL = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];
const VALID_DIFICULTAD = ['baja', 'media', 'alta'];

const parseListQuery = (query = {}) => {
  const page = Math.max(Number.parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit || '20', 10), 1), 100);
  const status = query.status ? String(query.status).trim() : '';

  if (status && !VALID_STATUS.includes(status)) {
    throw new ApiError(400, 'ValidationError', ['status invalido']);
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    status
  };
};

const sanitizeOption = (option) => ({
  label: String(option?.label || '').trim().toUpperCase(),
  text: String(option?.text || '').trim()
});

const validatePreviewQuestions = (questionsRaw) => {
  if (!Array.isArray(questionsRaw)) {
    throw new ApiError(400, 'ValidationError', ['questions debe ser un arreglo']);
  }

  const errors = [];
  const sanitized = questionsRaw.map((row, index) => {
    const qNumber = Number(row?.qNumber || index + 1);
    const statement = String(row?.statement || '').trim();
    const options = Array.isArray(row?.options) ? row.options.map(sanitizeOption) : [];
    const detectedAnswer = row?.detectedAnswer ? String(row.detectedAnswer).trim().toUpperCase() : null;
    const explanation = String(row?.explanation || '').trim();
    const area = String(row?.area || '').trim();
    const competencia = String(row?.competencia || '').trim();
    const nivelCognitivo = String(row?.nivelCognitivo || '').trim().toLowerCase();
    const dificultadCualitativa = String(row?.dificultadCualitativa || '').trim().toLowerCase();
    const tri = {
      a: row?.tri?.a === '' || row?.tri?.a === undefined || row?.tri?.a === null ? null : Number(row.tri.a),
      b: row?.tri?.b === '' || row?.tri?.b === undefined || row?.tri?.b === null ? null : Number(row.tri.b),
      c: row?.tri?.c === '' || row?.tri?.c === undefined || row?.tri?.c === null ? null : Number(row.tri.c)
    };
    const flags = Array.isArray(row?.flags) ? row.flags.map((item) => String(item)) : [];
    const confidence = Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : 0;

    if (!statement) errors.push(`questions[${index}].statement es requerido`);
    if (options.length < 2 || options.length > 5) {
      errors.push(`questions[${index}].options debe tener entre 2 y 5 opciones`);
    }
    if (options.some((option) => !VALID_OPTION_LABELS.includes(option.label) || !option.text)) {
      errors.push(`questions[${index}] contiene opciones invalidas`);
    }
    if (detectedAnswer && !VALID_OPTION_LABELS.includes(detectedAnswer)) {
      errors.push(`questions[${index}].detectedAnswer invalida`);
    }
    if (detectedAnswer && !options.some((option) => option.label === detectedAnswer)) {
      errors.push(`questions[${index}].detectedAnswer no existe en opciones`);
    }
    if (nivelCognitivo && !VALID_NIVEL.includes(nivelCognitivo)) {
      errors.push(`questions[${index}].nivelCognitivo invalido`);
    }
    if (dificultadCualitativa && !VALID_DIFICULTAD.includes(dificultadCualitativa)) {
      errors.push(`questions[${index}].dificultadCualitativa invalida`);
    }

    return {
      qNumber,
      statement,
      options,
      detectedAnswer,
      explanation,
      area,
      competencia,
      nivelCognitivo,
      dificultadCualitativa,
      tri,
      confidence: Math.max(0, Math.min(1, confidence)),
      flags,
      // Preservar campos de imágenes extraídas del PDF
      imageUrls: Array.isArray(row?.imageUrls) ? row.imageUrls : [],
      imageDescription: row?.imageDescription ? String(row.imageDescription).trim() : null
    };
  });

  if (errors.length) {
    throw new ApiError(400, 'ValidationError', errors);
  }

  return sanitized;
};

const parseConfirmPayload = (payload = {}) => {
  const raw = payload.selectedQuestionNumbers;
  if (raw === undefined) {
    return { selectedQuestionNumbers: [] };
  }

  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'ValidationError', ['selectedQuestionNumbers debe ser arreglo']);
  }

  const list = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return { selectedQuestionNumbers: Array.from(new Set(list)) };
};

module.exports = {
  parseListQuery,
  validatePreviewQuestions,
  parseConfirmPayload
};