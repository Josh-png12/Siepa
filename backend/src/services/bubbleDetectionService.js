const fs = require('fs/promises');
const path = require('path');
require('../utils/canvasShim');
const { validateBubblesFromImage } = require('./replicateService');
let _canvasLib;
const getCanvasLib = () => {
  if (_canvasLib) return _canvasLib;
  try {
    _canvasLib = require('canvas');
  } catch (_e1) {
    try {
      _canvasLib = require('@napi-rs/canvas');
    } catch (_e2) {
      throw new Error('No canvas implementation available. Install canvas or @napi-rs/canvas.');
    }
  }
  return _canvasLib;
};
const createCanvas = (...args) => getCanvasLib().createCanvas(...args);
const loadImage = (...args) => getCanvasLib().loadImage(...args);
const { renderPageToImage } = require('./pdfOcrService');
const omrCoords = require('../config/omrCoordinates.json');

// ─── Python OCR microservice ───────────────────────────────────────────────────

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8001';
const OCR_TIMEOUT_MS = 3000;

/**
 * Sends `imageBuffer` to the Python FastAPI+OpenCV microservice.
 * Returns { bubbleMatrix, qrToken } on success; throws on any failure.
 */
const callPythonOcrService = async (imageBuffer, { dpi = 200 } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

  try {
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, 'sheet.png');

    const res = await fetch(`${OCR_SERVICE_URL}/process-sheet?dpi=${dpi}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`Python OCR service HTTP ${res.status}`);
    }

    const { bubbleMatrix, qrToken, corrected, confidence } = await res.json();
    console.log(
      `[OMR] Python OpenCV service — corrected=${corrected} confidence=${confidence}`
    );
    return { bubbleMatrix, qrToken };
  } finally {
    clearTimeout(timer);
  }
};

// Pixels below this luminance (0–255) are treated as "filled/dark".
const DARK_THRESHOLD = Number(process.env.OMR_DARK_THRESHOLD || 128);

// Density range where canvas pixel analysis is uncertain — Gemini verifies these.
const GEMINI_DOUBT_MIN = 0.35;
const GEMINI_DOUBT_MAX = 0.55;
const GEMINI_VISION_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_BUBBLE_TIMEOUT_MS = 5000;

const callGeminiForBubble = async (canvas, cx, cy, radiusPx) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const pad = Math.ceil(radiusPx * 2);
    const sx = Math.max(0, cx - pad);
    const sy = Math.max(0, cy - pad);
    const sw = Math.min(canvas.width - sx, pad * 2);
    const sh = Math.min(canvas.height - sy, pad * 2);
    if (sw <= 0 || sh <= 0) return null;

    const cropCanvas = createCanvas(sw, sh);
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const base64 = cropCanvas.toBuffer('image/png').toString('base64');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_BUBBLE_TIMEOUT_MS);

    try {
      const res = await fetch(`${GEMINI_VISION_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: '¿Está la burbuja circular en el centro de esta imagen marcada con lápiz o bolígrafo? Responde SOLO: MARCADA o BLANCO' },
              { inline_data: { mime_type: 'image/png', data: base64 } }
            ]
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 }
        }),
        signal: controller.signal
      });

      if (!res.ok) return null;
      const data = await res.json();
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();
      if (text.includes('MARCADA')) return 0.8;
      if (text.includes('BLANCO')) return 0.1;
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch (_err) {
    return null;
  }
};

// Minimum fraction of non-transparent pixels needed to trust a bubble sample.
const MIN_COVERAGE = 0.5;

const mmToPx = (mm, dpi) => (mm * dpi) / 25.4;

// ─── Coordinate helpers ────────────────────────────────────────────────────────

/**
 * Returns the pixel center (cx, cy) of bubble at (questionNumber, optionIndex)
 * for a page rendered at `dpi`. Matches renderOmrPdf's layout exactly:
 *   baseX = gridOrigin.x + column * columnSpacing
 *   cx_mm = baseX + optionIndex * bubble.spacingX
 *   cy_mm = gridOrigin.y + row * bubble.spacingY
 */
const computeBubbleCenter = (questionNumber, optionIndex, dpi) => {
  const { gridOrigin, bubble, questionsPerColumn, columnSpacing } = omrCoords;
  const col = Math.floor((questionNumber - 1) / questionsPerColumn);
  const row = (questionNumber - 1) % questionsPerColumn;
  const baseX = gridOrigin.x + col * columnSpacing;
  return {
    x: Math.round(mmToPx(baseX + optionIndex * bubble.spacingX, dpi)),
    y: Math.round(mmToPx(gridOrigin.y + row * bubble.spacingY, dpi))
  };
};

// ─── Pixel sampling ────────────────────────────────────────────────────────────

/**
 * Counts dark pixels inside a circle of `radiusPx` around (cx, cy).
 * Returns density = darkPixels / totalPixels, or 0 if the area is out of bounds.
 */
const sampleCircleDensity = (imageData, cx, cy, radiusPx) => {
  const { data, width, height } = imageData;
  const r = Math.ceil(radiusPx);
  const r2 = radiusPx * radiusPx;
  let dark = 0;
  let total = 0;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const idx = (py * width + px) * 4;
      const alpha = data[idx + 3];
      if (alpha < 128) continue; // skip transparent pixels

      // Perceived luminance (ITU-R BT.601)
      const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
      total++;
      if (lum < DARK_THRESHOLD) dark++;
    }
  }

  if (total === 0) return 0;
  // If less than MIN_COVERAGE of expected circle pixels were sampled, treat as no data.
  const expectedPixels = Math.PI * radiusPx * radiusPx;
  if (total / expectedPixels < MIN_COVERAGE) return 0;

  return dark / total;
};

// ─── QR detection ─────────────────────────────────────────────────────────────

/**
 * Reads a QR code from an imageData (canvas ImageData object).
 * Returns the decoded string or null.
 */
const readQrFromImageData = (imageData) => {
  let jsQR;
  try {
    jsQR = require('jsqr');
  } catch (_error) {
    return null;
  }

  const code = jsQR(imageData.data, imageData.width, imageData.height);
  if (!code || !code.data) return null;
  return String(code.data);
};

// ─── Confidence & DeepSeek-VL fallback ────────────────────────────────────────

const DEEPSEEK_FALLBACK_CONFIDENCE_THRESHOLD = 80; // porcentaje mínimo de confianza antes de usar fallback
const DEEPSEEK_FALLBACK_MAX_X_RATIO = 0.2; // máximo de respuestas 'X' (no detectadas) antes de usar fallback

/**
 * Computa un puntaje de confianza (0-100) a partir del bubbleMatrix.
 * Se basa en el porcentaje de preguntas que tienen una burbuja claramente marcada
 * (densidad de la mejor opción > MARK_DENSITY_THRESHOLD).
 */
const computeConfidenceScore = (bubbleMatrix, markThreshold = 0.5) => {
  if (!Array.isArray(bubbleMatrix) || bubbleMatrix.length === 0) return 0;

  let clearMarks = 0;
  let total = 0;

  for (const row of bubbleMatrix) {
    if (!Array.isArray(row.optionsDensity) || row.optionsDensity.length === 0) continue;
    total++;
    const maxDensity = Math.max(...row.optionsDensity);
    if (maxDensity > markThreshold) {
      clearMarks++;
    }
  }

  return total > 0 ? Math.round((clearMarks / total) * 100) : 0;
};

/**
 * Convierte las respuestas de DeepSeek-VL (array de letras) al formato bubbleMatrix.
 *
 * @param {string[]} answers - Array de letras (A-E o 'X') por pregunta
 * @param {number} numOptions - Opciones por pregunta (default: 5)
 * @returns {Array} - bubbleMatrix [{ questionNumber, optionsDensity: [densA, densB, ...] }]
 */
const answersToBubbleMatrix = (answers, numOptions = 5) => {
  const optionIndex = { A: 0, B: 1, C: 2, D: 3, E: 4 };

  return answers.map((answer, idx) => {
    const densities = new Array(numOptions).fill(0);
    const optIdx = optionIndex[answer];
    if (optIdx !== undefined) {
      densities[optIdx] = 0.9; // alta densidad para la opción detectada
    }
    // Si es 'X' o inválido, todas las densidades quedan en 0 (no marcada)

    return {
      questionNumber: idx + 1,
      optionsDensity: densities
    };
  });
};

// ─── Core detection ───────────────────────────────────────────────────────────

/**
 * Given a PNG image Buffer (already rendered at `dpi`), reads omrCoordinates.json,
 * samples every bubble position, and returns:
 *   { bubbleMatrix: [{questionNumber, optionsDensity: [densA, densB, ...]}], qrToken: string|null }
 *
 * @param {Buffer} imageBuffer  - PNG image as Node.js Buffer
 * @param {object} opts
 * @param {number} opts.dpi            - DPI the image was rendered at (default 200)
 * @param {number} opts.totalQuestions - How many questions to scan (default from sheet config)
 * @param {number} opts.numOptions     - Options per question (default from omrCoordinates.json)
 */
const detectBubblesInImage = async (imageBuffer, { dpi = 200, totalQuestions = null, numOptions = null } = {}) => {
  const nOpts = numOptions || omrCoords.numOptions || 5;
  const nQ = totalQuestions || (omrCoords.columns * omrCoords.questionsPerColumn);

  let bubbleMatrix = null;
  let qrToken = null;
  let detectionMethod = 'none';

  // ── Step 1: Try Python microservice first ───────────────────────────────────
  try {
    const result = await callPythonOcrService(imageBuffer, { dpi });
    bubbleMatrix = result.bubbleMatrix
      .filter((r) => r.questionNumber <= nQ)
      .map((r) => ({
        questionNumber: r.questionNumber,
        optionsDensity: r.optionsDensity.slice(0, nOpts)
      }));
    qrToken = result.qrToken;
    detectionMethod = 'python-opencv';
    console.log(`[OMR] Python OpenCV detection: ${bubbleMatrix.length} preguntas procesadas`);
  } catch (err) {
    const isUnavailable =
      err.name === 'AbortError' ||
      err.code === 'ECONNREFUSED' ||
      (err.message && (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')));
    if (isUnavailable) {
      console.log(`[OMR] Python OCR service unavailable (${err.message}) — using canvas fallback`);
    } else {
      console.warn(`[OMR] Python OCR service error (${err.message}) — using canvas fallback`);
    }
  }

  // ── Step 2: Canvas fallback if Python didn't work ───────────────────────────
  if (!bubbleMatrix) {
    console.log('[OMR] Using canvas bubble detection');
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    const radiusPx = mmToPx(omrCoords.bubble.diameter / 2, dpi);

    // QR detection
    try {
      qrToken = readQrFromImageData(imageData);

      if (!qrToken) {
        const qx = Math.floor(mmToPx(omrCoords.qr.x, dpi));
        const qy = Math.floor(mmToPx(omrCoords.qr.y, dpi));
        const qsize = Math.ceil(mmToPx(omrCoords.qr.size, dpi));
        const pad = Math.ceil(mmToPx(5, dpi));
        const cropX = Math.max(0, qx - pad);
        const cropY = Math.max(0, qy - pad);
        const cropW = Math.min(img.width - cropX, qsize + pad * 2);
        const cropH = Math.min(img.height - cropY, qsize + pad * 2);

        if (cropW > 0 && cropH > 0) {
          const cropData = ctx.getImageData(cropX, cropY, cropW, cropH);
          qrToken = readQrFromImageData(cropData);
        }
      }
    } catch (_qrError) {
      qrToken = null;
    }

    // Bubble scanning
    bubbleMatrix = [];
    let geminiResolved = 0;
    let canvasResolved = 0;

    for (let q = 1; q <= nQ; q++) {
      const optionsDensity = [];
      for (let i = 0; i < nOpts; i++) {
        const { x, y } = computeBubbleCenter(q, i, dpi);
        let density = sampleCircleDensity(imageData, x, y, radiusPx);

        if (density >= GEMINI_DOUBT_MIN && density <= GEMINI_DOUBT_MAX) {
          const geminiDensity = await callGeminiForBubble(canvas, x, y, radiusPx);
          if (geminiDensity !== null) {
            density = geminiDensity;
            geminiResolved++;
          } else {
            canvasResolved++;
          }
        } else {
          canvasResolved++;
        }

        optionsDensity.push(Number(density.toFixed(4)));
      }
      bubbleMatrix.push({ questionNumber: q, optionsDensity });
    }

    console.log(`[OMR] Bubble resolution: ${canvasResolved} by canvas, ${geminiResolved} by Gemini`);
    detectionMethod = geminiResolved > 0 ? 'canvas+gemini' : 'canvas';
  }

  // ── Step 3: Compute confidence & apply DeepSeek-VL fallback if needed ───────
  const confidence = computeConfidenceScore(bubbleMatrix);
  const xCount = bubbleMatrix.filter((row) => {
    if (!Array.isArray(row.optionsDensity) || row.optionsDensity.length === 0) return true;
    return Math.max(...row.optionsDensity) <= 0.5;
  }).length;
  const xRatio = bubbleMatrix.length > 0 ? xCount / bubbleMatrix.length : 0;

  console.log(
    `[OMR] Confidence: ${confidence}% | X answers: ${xCount}/${bubbleMatrix.length} (${Math.round(xRatio * 100)}%) | Method: ${detectionMethod}`
  );

  const needsFallback =
    confidence < DEEPSEEK_FALLBACK_CONFIDENCE_THRESHOLD ||
    xRatio > DEEPSEEK_FALLBACK_MAX_X_RATIO;

  if (needsFallback && process.env.REPLICATE_API_TOKEN) {
    console.log('[OMR] Baja confianza — intentando fallback con DeepSeek-VL...');
    try {
      const base64Image = imageBuffer.toString('base64');
      const vlResult = await validateBubblesFromImage(base64Image, nQ);

      if (vlResult && Array.isArray(vlResult.answers) && vlResult.answers.length > 0) {
        const vlConfidence = vlResult.confidence || 0;
        console.log(`[OMR] DeepSeek-VL confidence: ${vlConfidence}%`);

        // Usar DeepSeek-VL solo si su confianza es mayor que la del canvas/opencv
        if (vlConfidence >= confidence) {
          bubbleMatrix = answersToBubbleMatrix(vlResult.answers, nOpts);
          detectionMethod = 'deepseek-vl-fallback';
          console.log(`[OMR] Usando resultados de DeepSeek-VL (confianza ${vlConfidence}% vs ${confidence}%)`);
        } else {
          console.log(`[OMR] DeepSeek-VL no mejoró la confianza (${vlConfidence}% vs ${confidence}%) — manteniendo resultado original`);
        }
      }
    } catch (vlErr) {
      console.warn(`[OMR] DeepSeek-VL fallback error: ${vlErr.message} — usando resultado original`);
    }
  } else if (needsFallback && !process.env.REPLICATE_API_TOKEN) {
    console.log('[OMR] DeepSeek-VL fallback omitido: REPLICATE_API_TOKEN no configurada');
  }

  return { bubbleMatrix, qrToken, detectionMethod, confidence };
};

// ─── PDF → page payloads ──────────────────────────────────────────────────────

/**
 * Renders every page of a PDF to PNG, runs bubble + QR detection on each page,
 * and returns an array of pagePayload objects ready for omrService.parsePDF.
 *
 * @param {string} pdfPath
 * @param {object} opts
 * @param {number} opts.dpi
 * @param {number} opts.totalQuestions
 * @param {number} opts.numOptions
 */
const generatePagePayloads = async (pdfPath, { dpi = 200, totalQuestions = null, numOptions = null } = {}) => {
  // Load PDF to find page count (reuse pdfjs-dist already loaded by pdfOcrService)
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

  const buffer = await fs.readFile(pdfPath);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const numPages = Number(doc.numPages || 1);

  const tmpDir = path.join(process.cwd(), 'uploads', 'tmp', 'omr-detect');
  await fs.mkdir(tmpDir, { recursive: true });

  const pagePayloads = [];

  for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
    const tmpPng = path.join(tmpDir, `detect_${Date.now()}_p${pageNumber}.png`);

    try {
      await renderPageToImage({ pdfPath, pageNumber, outPngPath: tmpPng, dpi });
      const imageBuffer = await fs.readFile(tmpPng);
      const { bubbleMatrix, qrToken } = await detectBubblesInImage(imageBuffer, {
        dpi,
        totalQuestions,
        numOptions
      });

      pagePayloads.push({
        pageNumber,
        qrToken,
        bubbleMatrix,
        answers: []
      });
    } finally {
      await fs.unlink(tmpPng).catch(() => {});
    }
  }

  return pagePayloads;
};

module.exports = {
  detectBubblesInImage,
  generatePagePayloads,
  computeBubbleCenter,
  sampleCircleDensity,
  computeConfidenceScore,
  answersToBubbleMatrix,
  DARK_THRESHOLD,
  DEEPSEEK_FALLBACK_CONFIDENCE_THRESHOLD
};
