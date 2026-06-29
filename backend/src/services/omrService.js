const fs = require('fs/promises');
const path = require('path');
const ApiError = require('../utils/ApiError');
const omrCoordinates = require('../config/omrCoordinates.json');
const { VALID_OPTIONS } = require('../validators/physicalSimulacroValidators');

const LOW_CONFIDENCE_THRESHOLD = 0.65;
const MARK_DENSITY_THRESHOLD = 0.5;

// Converts mm coordinates from omrCoordinates.json to pixels at a given DPI.
// Assumes 5 options (A–E) per question, laid out left-to-right with bubble.spacingX between them.
// Questions fill column 0 first (rows 1–questionsPerColumn), then col 1, then col 2.
const computeExpectedPixelCoords = (questionNumber, optionIndex, dpi = 200) => {
  const mmToPx = (mm) => Math.round((mm * dpi) / 25.4);
  const { questionsPerColumn, columns, gridOrigin, bubble, margins, pageWidth } = omrCoordinates;
  const colWidth = (pageWidth - margins.left - margins.right) / columns;
  const colIndex = Math.floor((questionNumber - 1) / questionsPerColumn);
  const rowIndex = (questionNumber - 1) % questionsPerColumn;
  const colOriginX = gridOrigin.x + colIndex * colWidth;
  const x = mmToPx(colOriginX + optionIndex * bubble.spacingX + bubble.diameter / 2);
  const y = mmToPx(gridOrigin.y + rowIndex * bubble.spacingY + bubble.diameter / 2);
  return { x, y };
};

const omrDebug = (...args) => {
  if (process.env.DEBUG_OMR === 'true') console.log('[OMR_DEBUG]', ...args);
};

const parseQrPayload = (payload) => {
  if (!payload) return null;

  // Try HMAC-signed token format first (base64url_payload.base64url_sig)
  if (typeof payload === 'string' && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(payload)) {
    try {
      const { verifyQRToken } = require('../utils/qrToken');
      const result = verifyQRToken(payload);
      return { studentId: result.studentId, simulacroId: result.simulacroId, _verified: true };
    } catch (err) {
      if (err.message === 'TOKEN_EXPIRED') {
        return { _error: 'TOKEN_EXPIRED' };
      }
      if (err.message === 'INVALID_SIGNATURE') {
        return { _error: 'INVALID_SIGNATURE' };
      }
      // Fall through to legacy JSON parse
    }
  }

  // Legacy JSON format fallback (supports old plain-JSON QR tokens)
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

const detectBubblesFromCoordinateMatrix = ({ bubbleMatrix, totalQuestions, dpi = 200 }) => {
  if (!Array.isArray(bubbleMatrix)) {
    omrDebug(`bubbleMatrix is not an array (got ${typeof bubbleMatrix}) — returning empty`);
    return [];
  }

  omrDebug(`--- detectBubblesFromCoordinateMatrix: totalQuestions=${totalQuestions} matrixRows=${bubbleMatrix.length} dpi=${dpi} markThreshold=${MARK_DENSITY_THRESHOLD} ---`);

  const parsed = [];
  let missingRows = 0;
  let markedCount = 0;

  for (let questionNumber = 1; questionNumber <= totalQuestions; questionNumber += 1) {
    const row = bubbleMatrix.find((item) => Number(item.questionNumber) === questionNumber);

    if (!row || !Array.isArray(row.optionsDensity)) {
      missingRows += 1;
      if (process.env.DEBUG_OMR === 'true' && missingRows <= 5) {
        omrDebug(`  Q${questionNumber}: NO ROW in bubbleMatrix (missingRows so far: ${missingRows})`);
      }
      parsed.push({ questionNumber, markedOption: null, confidence: 0 });
      continue;
    }

    const options = row.optionsDensity.map((density, index) => {
      const label = String.fromCharCode(65 + index);
      const coords = computeExpectedPixelCoords(questionNumber, index, dpi);
      return { option: label, density: Number(density) || 0, coords };
    });

    const sorted = [...options].sort((a, b) => b.density - a.density);
    const top = sorted[0] || { option: null, density: 0, coords: { x: 0, y: 0 } };
    const second = sorted[1] || { density: 0 };

    const confidence = Math.max(0, Math.min(1, top.density - second.density));
    const markedOption = top.density > MARK_DENSITY_THRESHOLD ? top.option : null;
    if (markedOption) markedCount += 1;

    if (process.env.DEBUG_OMR === 'true') {
      const densityBar = options.map((o) => `${o.option}=${o.density.toFixed(3)}@(${o.coords.x},${o.coords.y}px)`).join('  ');
      const verdict = markedOption
        ? `→ MARKED ${markedOption} (density ${top.density.toFixed(3)} > ${MARK_DENSITY_THRESHOLD}, conf=${confidence.toFixed(3)})`
        : `→ UNMARKED (top=${top.option} density=${top.density.toFixed(3)} ≤ ${MARK_DENSITY_THRESHOLD})`;
      omrDebug(`  Q${String(questionNumber).padStart(3)}: ${densityBar}  ${verdict}`);
    }

    parsed.push({ questionNumber, markedOption, confidence });
  }

  omrDebug(`--- result: ${markedCount}/${totalQuestions} marked, ${missingRows} rows missing from matrix ---`);

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

  const { pagePayloads = null, totalQuestions = 147, dpi = 200 } = options;

  omrDebug(`parsePDF called: file=${path.basename(absolutePath)} totalQuestions=${totalQuestions} dpi=${dpi} pagePayloads=${pagePayloads ? pagePayloads.length : 'null'}`);

  if (!pagePayloads || !Array.isArray(pagePayloads) || pagePayloads.length === 0) {
    omrDebug('FAIL: pagePayloads missing or empty — throwing 422');
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
    omrDebug(`  page ${index + 1}: byAnswers=${byAnswers.length} entries, bubbleMatrix=${Array.isArray(page.bubbleMatrix) ? page.bubbleMatrix.length : 'null'} rows`);

    const byMatrix = detectBubblesFromCoordinateMatrix({
      bubbleMatrix: page.bubbleMatrix,
      totalQuestions,
      dpi
    });

    const source = byAnswers.length ? 'answers' : 'matrix';
    const mergedAnswers = byAnswers.length ? byAnswers : byMatrix;
    const markedInMerged = mergedAnswers.filter((a) => a.markedOption !== null).length;
    const avgConfidence = mergedAnswers.length
      ? mergedAnswers.reduce((acc, row) => acc + (row.confidence || 0), 0) / mergedAnswers.length
      : 0;

    omrDebug(`  page ${index + 1}: source=${source} mergedAnswers=${mergedAnswers.length} marked=${markedInMerged} avgConf=${avgConfidence.toFixed(3)}`);

    const flags = [];
    if (!qr) flags.push('MISSING_QR');
    if (!mergedAnswers.length) flags.push('NO_BUBBLE_DATA');
    if (avgConfidence < LOW_CONFIDENCE_THRESHOLD) flags.push('LOW_CONFIDENCE');

    omrDebug(`  page ${index + 1}: qr=${qr ? JSON.stringify(qr) : 'MISSING'} flags=${JSON.stringify(flags)}`);

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
  detectBubblesFromCoordinateMatrix,
  computeExpectedPixelCoords,
  LOW_CONFIDENCE_THRESHOLD,
  MARK_DENSITY_THRESHOLD
};
