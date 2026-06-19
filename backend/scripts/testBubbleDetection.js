#!/usr/bin/env node
/**
 * Tests bubbleDetectionService by generating a synthetic OMR sheet PNG,
 * pre-filling known bubbles, running detection, and verifying results.
 *
 * Usage:
 *   node scripts/testBubbleDetection.js
 *   DPI=300 node scripts/testBubbleDetection.js
 */

const path = require('path');
// Use @napi-rs/canvas (prebuilt for Node 18–24) with fallback to canvas
let _canvas;
try { _canvas = require('canvas'); } catch (_e) { _canvas = require('@napi-rs/canvas'); }
const { createCanvas } = _canvas;

const projectRoot = path.join(__dirname, '..');
const { detectBubblesInImage, computeBubbleCenter } = require(path.join(projectRoot, 'src/services/bubbleDetectionService'));
const { MARK_DENSITY_THRESHOLD } = require(path.join(projectRoot, 'src/services/omrService'));
const omrCoords = require(path.join(projectRoot, 'src/config/omrCoordinates.json'));

const DPI = Number(process.env.DPI || 200);
const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);

const SHEET_W = mmToPx(omrCoords.pageWidth);
const SHEET_H = mmToPx(omrCoords.pageHeight);
const TOTAL_Q = omrCoords.columns * omrCoords.questionsPerColumn;

// Questions to mark: {q: questionNumber, opt: optionIndex 0=A..4=E}
// NOTE: rows 42-48 (per column) exceed the letter-page height — tested questions stay within rows 0-41.
// Row 41 → cy_mm = 30+41*6 = 276mm < 279mm ✓; row 42 → 282mm > 279mm ✗
const MARKS = [
  { q: 1, opt: 0 },    // Q1 → A (col 0 row 0)
  { q: 5, opt: 2 },    // Q5 → C (col 0 row 4)
  { q: 10, opt: 1 },   // Q10 → B (col 0 row 9)
  { q: 42, opt: 4 },   // Q42 → E (col 0 last on-page row 41)
  { q: 50, opt: 3 },   // Q50 → D (col 1 row 0)
  { q: 90, opt: 0 },   // Q90 → A (col 1 last on-page row 40)
  { q: 140, opt: 2 }   // Q140 → C (col 2 last on-page row 41)
];

// Questions that must NOT be detected as marked
const UNMARKED_SAMPLE = [2, 6, 20, 41, 51, 80, TOTAL_Q - 1];

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m'
};
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const header = (msg) => console.log(`\n${c.bold}${c.cyan}══ ${msg} ══${c.reset}`);

(async () => {
  header(`Generating synthetic OMR sheet — ${SHEET_W}×${SHEET_H}px at ${DPI} DPI`);

  // ── Build white sheet ────────────────────────────────────────────────────────
  const canvas = createCanvas(SHEET_W, SHEET_H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  // Draw empty bubble outlines for all positions (light gray ring) so off-target
  // density measurements stay close to 0 (blank white paper).
  const radiusPx = mmToPx(omrCoords.bubble.diameter / 2);
  const nOpts = omrCoords.numOptions || 5;

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

  // ── Fill marked bubbles ──────────────────────────────────────────────────────
  ctx.fillStyle = '#111111';
  for (const { q, opt } of MARKS) {
    const { x, y } = computeBubbleCenter(q, opt, DPI);
    ctx.beginPath();
    ctx.arc(x, y, radiusPx * 0.85, 0, Math.PI * 2);
    ctx.fill();
    console.log(`${c.gray}  Drew Q${q} opt=${String.fromCharCode(65 + opt)} at (${x},${y})px r=${(radiusPx * 0.85).toFixed(1)}${c.reset}`);
  }

  const pngBuffer = canvas.toBuffer('image/png');
  console.log(`\nSheet PNG: ${(pngBuffer.length / 1024).toFixed(1)} KB`);

  // ── Run detection ────────────────────────────────────────────────────────────
  header('Running detectBubblesInImage');
  const start = Date.now();
  const { bubbleMatrix, qrToken } = await detectBubblesInImage(pngBuffer, { dpi: DPI, totalQuestions: TOTAL_Q });
  console.log(`  Completed in ${Date.now() - start}ms`);
  console.log(`  QR token: ${qrToken || '(none — expected, no QR drawn)'}`);
  console.log(`  bubbleMatrix rows: ${bubbleMatrix.length}`);

  // ── Verify marked bubbles ────────────────────────────────────────────────────
  header('Checking marked bubbles');
  let passed = 0;
  let failed = 0;

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

  // ── Verify unmarked bubbles (false-positive check) ───────────────────────────
  header('Checking unmarked bubbles (false-positive check)');
  let fpPassed = 0;
  let fpFailed = 0;

  for (const q of UNMARKED_SAMPLE) {
    if (MARKS.find((m) => m.q === q)) continue; // skip intentionally marked
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

  // ── Summary ──────────────────────────────────────────────────────────────────
  header('Summary');
  console.log(`  Marked detection:   ${passed}/${MARKS.length} passed${failed > 0 ? ` (${failed} failed)` : ''}`);
  console.log(`  False-positive check: ${fpPassed}/${UNMARKED_SAMPLE.length} passed${fpFailed > 0 ? ` (${fpFailed} false positives)` : ''}`);
  console.log(`  Threshold used: ${MARK_DENSITY_THRESHOLD}  DPI: ${DPI}  radiusPx: ${radiusPx.toFixed(1)}\n`);

  if (failed > 0 || fpFailed > 0) {
    console.log(`${c.red}${c.bold}FAILED${c.reset} — some detections were wrong. Check DPI, bubble coordinates, and DARK_THRESHOLD.`);
    console.log(`  Tip: run with DEBUG_OMR=true to see per-question density logs from omrService.`);
    process.exit(1);
  } else {
    console.log(`${c.green}${c.bold}ALL PASSED${c.reset}`);
    process.exit(0);
  }
})().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
