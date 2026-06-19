const fs = require('fs/promises');
const path = require('path');
// canvas is a native module — try the pre-built @napi-rs/canvas first (Node 18-24 prebuilt binaries
// available on all platforms), then fall back to the original canvas package.
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

// Pixels below this luminance (0–255) are treated as "filled/dark".
const DARK_THRESHOLD = Number(process.env.OMR_DARK_THRESHOLD || 128);

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

  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  const radiusPx = mmToPx(omrCoords.bubble.diameter / 2, dpi);

  // ── QR detection in the QR zone ─────────────────────────────────────────────
  let qrToken = null;
  try {
    // jsQR works best on the full image; try full then crop to QR region
    qrToken = readQrFromImageData(imageData);

    if (!qrToken) {
      // Crop to the QR region defined in omrCoordinates.json and retry
      const qx = Math.floor(mmToPx(omrCoords.qr.x, dpi));
      const qy = Math.floor(mmToPx(omrCoords.qr.y, dpi));
      const qsize = Math.ceil(mmToPx(omrCoords.qr.size, dpi));
      const pad = Math.ceil(mmToPx(5, dpi)); // 5mm padding around QR
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

  // ── Bubble scanning ──────────────────────────────────────────────────────────
  const bubbleMatrix = [];

  for (let q = 1; q <= nQ; q++) {
    const optionsDensity = [];
    for (let i = 0; i < nOpts; i++) {
      const { x, y } = computeBubbleCenter(q, i, dpi);
      const density = sampleCircleDensity(imageData, x, y, radiusPx);
      optionsDensity.push(Number(density.toFixed(4)));
    }
    bubbleMatrix.push({ questionNumber: q, optionsDensity });
  }

  return { bubbleMatrix, qrToken };
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
  let pdfjsLib;
  try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  } catch (_error) {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  }

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
  DARK_THRESHOLD
};
