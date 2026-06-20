#!/usr/bin/env node
/**
 * Tests bubble detection using both the canvas fallback and the Python OpenCV
 * microservice (if running), then compares results side-by-side.
 *
 * Usage:
 *   node scripts/testBubbleDetection.js
 *   DPI=300 node scripts/testBubbleDetection.js
 *   OCR_SERVICE_URL=http://localhost:8001 node scripts/testBubbleDetection.js
 */

const path = require('path');
let _canvas;
try { _canvas = require('canvas'); } catch (_e) { _canvas = require('@napi-rs/canvas'); }
const { createCanvas } = _canvas;

const projectRoot = path.join(__dirname, '..');
const { detectBubblesInImage, computeBubbleCenter } = require(path.join(projectRoot, 'src/services/bubbleDetectionService'));
const { MARK_DENSITY_THRESHOLD } = require(path.join(projectRoot, 'src/services/omrService'));
const omrCoords = require(path.join(projectRoot, 'src/config/omrCoordinates.json'));

const DPI = Number(process.env.DPI || 200);
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8001';
const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);

const SHEET_W = mmToPx(omrCoords.pageWidth);
const SHEET_H = mmToPx(omrCoords.pageHeight);
const TOTAL_Q = omrCoords.columns * omrCoords.questionsPerColumn;

// Questions to mark: {q: questionNumber, opt: optionIndex 0=A..4=E}
// NOTE: rows 42-48 (per column) exceed the letter-page height — tested questions stay within rows 0-41.
const MARKS = [
  { q: 1,   opt: 0 },  // Q1  → A (col 0 row 0)
  { q: 5,   opt: 2 },  // Q5  → C (col 0 row 4)
  { q: 10,  opt: 1 },  // Q10 → B (col 0 row 9)
  { q: 42,  opt: 4 },  // Q42 → E (col 0 last on-page row 41)
  { q: 50,  opt: 3 },  // Q50 → D (col 1 row 0)
  { q: 90,  opt: 0 },  // Q90 → A (col 1 last on-page row 40)
  { q: 140, opt: 2 }   // Q140 → C (col 2 last on-page row 41)
];

const UNMARKED_SAMPLE = [2, 6, 20, 41, 51, 80, TOTAL_Q - 1];

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m',
  gray: '\x1b[90m', yellow: '\x1b[33m', blue: '\x1b[34m'
};
const ok   = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.blue}ℹ${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const header = (msg) => console.log(`\n${c.bold}${c.cyan}══ ${msg} ══${c.reset}`);

// ── Build synthetic OMR sheet ────────────────────────────────────────────────

function buildSyntheticSheet() {
  const canvas = createCanvas(SHEET_W, SHEET_H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  const radiusPx = mmToPx(omrCoords.bubble.diameter / 2);
  const nOpts = omrCoords.numOptions || 5;

  // Light gray bubble outlines
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  for (let q = 1; q <= TOTAL_Q; q++) {
    for (let i = 0; i < nOpts; i++) {
      const { x, y } = computeBubbleCenter(q, i, DPI);
      ctx.beginPath();
      ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Fill marked bubbles
  ctx.fillStyle = '#111111';
  for (const { q, opt } of MARKS) {
    const { x, y } = computeBubbleCenter(q, opt, DPI);
    ctx.beginPath();
    ctx.arc(x, y, radiusPx * 0.85, 0, Math.PI * 2);
    ctx.fill();
    console.log(`${c.gray}  Drew Q${q} opt=${String.fromCharCode(65 + opt)} at (${x},${y})px r=${(radiusPx * 0.85).toFixed(1)}${c.reset}`);
  }

  return canvas.toBuffer('image/png');
}

// ── Verify detection results ─────────────────────────────────────────────────

function verifyResults(bubbleMatrix, label) {
  let passed = 0;
  let failed = 0;

  console.log(`\n  ${c.bold}Marked bubbles (${label}):${c.reset}`);
  for (const { q, opt } of MARKS) {
    const row = bubbleMatrix.find((r) => r.questionNumber === q);
    if (!row) {
      fail(`Q${q}: missing from bubbleMatrix`);
      failed++;
      continue;
    }
    const densities = row.optionsDensity;
    const maxDens = Math.max(...densities);
    const maxIdx = densities.indexOf(maxDens);
    const detected = maxDens > MARK_DENSITY_THRESHOLD ? String.fromCharCode(65 + maxIdx) : null;
    const expected = String.fromCharCode(65 + opt);
    if (detected === expected) {
      ok(`Q${q}: ${detected} (density=${maxDens.toFixed(4)} > ${MARK_DENSITY_THRESHOLD})`);
      passed++;
    } else {
      fail(`Q${q}: expected=${expected} detected=${detected || 'UNMARKED'} density=${maxDens.toFixed(4)}`);
      failed++;
    }
  }

  let fpPassed = 0;
  let fpFailed = 0;
  console.log(`\n  ${c.bold}Unmarked (false-positive check) (${label}):${c.reset}`);
  for (const q of UNMARKED_SAMPLE) {
    if (MARKS.find((m) => m.q === q)) continue;
    const row = bubbleMatrix.find((r) => r.questionNumber === q);
    if (!row) continue;
    const maxDens = Math.max(...row.optionsDensity);
    if (maxDens <= MARK_DENSITY_THRESHOLD) {
      ok(`Q${q}: correctly blank (max density=${maxDens.toFixed(4)})`);
      fpPassed++;
    } else {
      fail(`Q${q}: FALSE POSITIVE — density=${maxDens.toFixed(4)} > ${MARK_DENSITY_THRESHOLD}`);
      fpFailed++;
    }
  }

  return { passed, failed, fpPassed, fpFailed };
}

// ── Side-by-side diff ────────────────────────────────────────────────────────

function sideBySideDiff(canvasMatrix, pythonMatrix) {
  header('Side-by-side density comparison (marked questions only)');
  const fmt = (d) => d.toFixed(4);

  for (const { q, opt } of MARKS) {
    const cr = canvasMatrix.find((r) => r.questionNumber === q);
    const pr = pythonMatrix.find((r) => r.questionNumber === q);
    if (!cr || !pr) continue;

    const letter = String.fromCharCode(65 + opt);
    const cd = cr.optionsDensity[opt];
    const pd = pr.optionsDensity[opt];
    const diff = Math.abs(cd - pd);
    const diffStr = diff > 0.05 ? `${c.yellow}Δ${diff.toFixed(4)}${c.reset}` : `Δ${diff.toFixed(4)}`;
    console.log(`  Q${String(q).padEnd(3)} opt=${letter}  canvas=${fmt(cd)}  python=${fmt(pd)}  ${diffStr}`);
  }
}

// ── Call Python service directly (bypassing Node fallback logic) ─────────────

async function callPythonDirect(pngBuffer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const blob = new Blob([pngBuffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, 'sheet.png');

    const res = await fetch(`${OCR_SERVICE_URL}/process-sheet?dpi=${DPI}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Canvas-only detection (force fallback by temporarily disabling env var) ──

async function callCanvasDirect(pngBuffer) {
  // Save and clear OCR_SERVICE_URL so detectBubblesInImage skips the Python path
  const saved = process.env.OCR_SERVICE_URL;
  process.env.OCR_SERVICE_URL = 'http://127.0.0.1:0'; // guaranteed to refuse
  try {
    return await detectBubblesInImage(pngBuffer, { dpi: DPI, totalQuestions: TOTAL_Q });
  } finally {
    if (saved !== undefined) process.env.OCR_SERVICE_URL = saved;
    else delete process.env.OCR_SERVICE_URL;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  header(`Generating synthetic OMR sheet — ${SHEET_W}×${SHEET_H}px at ${DPI} DPI`);
  const pngBuffer = buildSyntheticSheet();
  console.log(`\nSheet PNG: ${(pngBuffer.length / 1024).toFixed(1)} KB`);

  // ── Canvas detection ──────────────────────────────────────────────────────
  header('Canvas detection (fallback method)');
  const t0 = Date.now();
  const canvasResult = await callCanvasDirect(pngBuffer);
  console.log(`  Completed in ${Date.now() - t0}ms  |  QR: ${canvasResult.qrToken || '(none)'}`);
  const canvasStats = verifyResults(canvasResult.bubbleMatrix, 'canvas');

  // ── Python microservice detection ─────────────────────────────────────────
  header('Python OpenCV microservice');
  let pythonResult = null;
  let pythonStats = null;

  try {
    const t1 = Date.now();
    pythonResult = await callPythonDirect(pngBuffer);
    console.log(
      `  Completed in ${Date.now() - t1}ms  |  QR: ${pythonResult.qrToken || '(none)'}` +
      `  |  corrected=${pythonResult.corrected}  confidence=${pythonResult.confidence}`
    );
    pythonStats = verifyResults(pythonResult.bubbleMatrix, 'python');
  } catch (err) {
    if (err.name === 'AbortError' || err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed')) {
      warn(`Python OCR service not reachable at ${OCR_SERVICE_URL} — skipping comparison`);
      info('Start the service with:  cd ocr-service && start.bat');
    } else {
      warn(`Python OCR service error: ${err.message}`);
    }
  }

  // ── Side-by-side comparison ───────────────────────────────────────────────
  if (pythonResult) {
    sideBySideDiff(canvasResult.bubbleMatrix, pythonResult.bubbleMatrix);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  header('Summary');
  console.log(`  Threshold: ${MARK_DENSITY_THRESHOLD}  DPI: ${DPI}\n`);

  console.log(`  ${c.bold}Canvas:${c.reset}  marked ${canvasStats.passed}/${MARKS.length}  false-pos ${canvasStats.fpFailed > 0 ? c.red : c.green}${canvasStats.fpFailed}${c.reset}`);
  if (pythonStats) {
    console.log(`  ${c.bold}Python:${c.reset}  marked ${pythonStats.passed}/${MARKS.length}  false-pos ${pythonStats.fpFailed > 0 ? c.red : c.green}${pythonStats.fpFailed}${c.reset}`);
  } else {
    console.log(`  ${c.bold}Python:${c.reset}  ${c.yellow}not tested (service offline)${c.reset}`);
  }

  const anyFailed =
    canvasStats.failed > 0 ||
    canvasStats.fpFailed > 0 ||
    (pythonStats && (pythonStats.failed > 0 || pythonStats.fpFailed > 0));

  console.log('');
  if (anyFailed) {
    console.log(`${c.red}${c.bold}FAILED${c.reset} — some detections were wrong.`);
    process.exit(1);
  } else {
    console.log(`${c.green}${c.bold}ALL PASSED${c.reset}`);
    process.exit(0);
  }
})().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
