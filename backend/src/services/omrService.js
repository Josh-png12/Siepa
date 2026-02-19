const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');
const omrCoordinates = require('../config/omrCoordinates.json');
const { VALID_OPTIONS } = require('../validators/physicalSimulacroValidators');

const LOW_CONFIDENCE_THRESHOLD = 0.65;

const parseQrPayload = (payload) => {
  if (!payload) return null;

  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!parsed.studentId && parsed.studentID) parsed.studentId = parsed.studentID;
    if (!parsed.simulacroId && parsed.simulacroPhysicalID) parsed.simulacroId = parsed.simulacroPhysicalID;
    return parsed;
  } catch (_error) {
    return null;
  }
};

const normalizeAnswers = (answers = []) => {
  if (!Array.isArray(answers)) return [];

  return answers
    .map((row) => {
      const questionNumber = Number(row.questionNumber ?? row.question);
      const markedOptionRaw = row.markedOption ?? row.selected ?? row.option ?? null;
      const markedOption = markedOptionRaw ? String(markedOptionRaw).toUpperCase() : null;
      const confidence = Number(row.confidence ?? row.density ?? 0);
      return {
        questionNumber,
        markedOption: VALID_OPTIONS.has(markedOption) ? markedOption : null,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        multipleMarks: Array.isArray(row.markedOptions) && row.markedOptions.length > 1
      };
    })
    .filter((row) => Number.isInteger(row.questionNumber) && row.questionNumber > 0);
};

const detectBubblesFromCoordinateMatrix = ({ bubbleMatrix, totalQuestions }) => {
  if (!Array.isArray(bubbleMatrix)) return [];

  const parsed = [];

  for (let questionNumber = 1; questionNumber <= totalQuestions; questionNumber += 1) {
    const row = bubbleMatrix.find((item) => Number(item.questionNumber) === questionNumber);
    if (!row || !Array.isArray(row.optionsDensity)) {
      parsed.push({ questionNumber, markedOption: null, confidence: 0 });
      continue;
    }

    const sorted = row.optionsDensity
      .map((density, index) => ({ option: String.fromCharCode(65 + index), density: Number(density) || 0 }))
      .sort((a, b) => b.density - a.density);

    const top = sorted[0] || { option: null, density: 0 };
    const second = sorted[1] || { density: 0 };

    const confidence = Math.max(0, Math.min(1, top.density - second.density));
    const markedOption = top.density > 0.5 ? top.option : null;

    parsed.push({
      questionNumber,
      markedOption,
      confidence
    });
  }

  return parsed;
};

const parsePDF = async (filePath, options = {}) => {
  if (!filePath) throw new ApiError(400, 'filePath is required');

  // Ensure file exists and is under allowed upload root
  const absolutePath = path.resolve(filePath);
  const allowedRoot = path.resolve(path.join(process.cwd(), 'uploads', 'physical-simulacros'));
  if (!absolutePath.startsWith(allowedRoot)) {
    throw new ApiError(400, 'Invalid upload location');
  }

  await fs.access(absolutePath);

  const { pagePayloads = null, totalQuestions = 147 } = options;

  if (!pagePayloads || !Array.isArray(pagePayloads) || pagePayloads.length === 0) {
    // Production contract: OCR extraction stage must provide per-page payloads.
    // Keep service strict to avoid fake parsing in production.
    throw new ApiError(
      422,
      'OMR extraction payload missing. Provide pagePayloads extracted by scanner pipeline.'
    );
  }

  const pages = pagePayloads.map((page, index) => {
    const qr = parseQrPayload(page.qrToken || page.qrPayload);

    const byAnswers = normalizeAnswers(page.answers);
    const byMatrix = detectBubblesFromCoordinateMatrix({
      bubbleMatrix: page.bubbleMatrix,
      totalQuestions
    });

    const mergedAnswers = byAnswers.length ? byAnswers : byMatrix;
    const avgConfidence = mergedAnswers.length
      ? mergedAnswers.reduce((acc, row) => acc + (row.confidence || 0), 0) / mergedAnswers.length
      : 0;

    const flags = [];
    if (!qr) flags.push('MISSING_QR');
    if (!mergedAnswers.length) flags.push('NO_BUBBLE_DATA');
    if (avgConfidence < LOW_CONFIDENCE_THRESHOLD) flags.push('LOW_CONFIDENCE');

    return {
      pageNumber: index + 1,
      qrToken: page.qrToken || page.qrPayload || null,
      qr,
      answers: mergedAnswers,
      detectionConfidence: Number(avgConfidence.toFixed(4)),
      flags
    };
  });

  return {
    filePath: absolutePath,
    coordinatesProfile: omrCoordinates,
    pages
  };
};

const evaluateAnswerSheet = ({ sheet, answerKey, thetaCalculator }) => {
  const keyMap = new Map((answerKey || []).map((row) => [Number(row.questionNumber), String(row.correctOption).toUpperCase()]));

  let rawScore = 0;
  const parsedAnswers = [];
  let status = 'valid';
  const errors = [];

  for (const answer of sheet.answers || []) {
    const questionNumber = Number(answer.questionNumber);
    const expected = keyMap.get(questionNumber);
    const marked = answer.markedOption ? String(answer.markedOption).toUpperCase() : null;
    const confidence = Number(answer.confidence || 0);
    const multipleMarks = Boolean(answer.multipleMarks);

    if (!expected) continue;

    if (multipleMarks) {
      status = 'invalid';
      errors.push({ type: 'MULTIPLE_MARKS', message: `Question ${questionNumber} has multiple marks` });
      parsedAnswers.push({ questionNumber, markedOption: null, confidence });
      continue;
    }

    if (!marked) {
      parsedAnswers.push({ questionNumber, markedOption: null, confidence });
      continue;
    }

    if (!VALID_OPTIONS.has(marked)) {
      status = 'invalid';
      errors.push({ type: 'INVALID_OPTION', message: `Question ${questionNumber} has invalid option ${marked}` });
      parsedAnswers.push({ questionNumber, markedOption: null, confidence });
      continue;
    }

    if (confidence < LOW_CONFIDENCE_THRESHOLD && status !== 'invalid') {
      status = 'needsReview';
      errors.push({ type: 'LOW_CONFIDENCE', message: `Question ${questionNumber} confidence below threshold` });
    }

    if (marked === expected) rawScore += 1;
    parsedAnswers.push({ questionNumber, markedOption: marked, confidence });
  }

  const scorePercent = keyMap.size > 0 ? Number(((rawScore / keyMap.size) * 100).toFixed(2)) : 0;

  const theta = typeof thetaCalculator === 'function'
    ? thetaCalculator(parsedAnswers)
    : null;

  return {
    rawScore,
    scorePercent,
    theta,
    status,
    errors,
    parsedAnswers
  };
};

module.exports = {
  parsePDF,
  evaluateAnswerSheet,
  parseQrPayload,
  LOW_CONFIDENCE_THRESHOLD
};
