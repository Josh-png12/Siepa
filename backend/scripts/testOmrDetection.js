#!/usr/bin/env node
/**
 * Diagnóstico del pipeline OMR de detección de burbujas.
 * No requiere archivo real ni base de datos.
 *
 * Uso:
 *   node scripts/testOmrDetection.js             # logs compactos
 *   DEBUG_OMR=true node scripts/testOmrDetection.js  # logs detallados por pregunta
 *
 * Variables de entorno opcionales:
 *   DEBUG_OMR=true     → activa los logs de diagnóstico en omrService
 *   DPI=300            → DPI para calcular coordenadas de píxeles esperadas
 */

process.env.DEBUG_OMR = process.env.DEBUG_OMR ?? 'true';

const path = require('path');
// Resolve desde la raíz del proyecto (backend/)
const projectRoot = path.join(__dirname, '..');
const {
  detectBubblesFromCoordinateMatrix,
  evaluateAnswerSheet,
  computeExpectedPixelCoords,
  MARK_DENSITY_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD
} = require(path.join(projectRoot, 'src/services/omrService'));
const omrCoordinates = require(path.join(projectRoot, 'src/config/omrCoordinates.json'));

const DPI = Number(process.env.DPI || 200);
const TOTAL_QUESTIONS = 10; // Reducido para output legible; cambia a 147 para producción

// ─── helpers de consola ────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};
const ok = (msg) => console.log(`${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}✗${c.reset} ${msg}`);
const header = (msg) => console.log(`\n${c.bold}${c.cyan}══ ${msg} ══${c.reset}`);
const row = (...cols) => console.log(cols.map((v) => String(v).padEnd(14)).join(''));

// ─── fixture de claves de respuesta ───────────────────────────────────────────
const ANSWER_KEY = [
  { questionNumber: 1, correctOption: 'A' },
  { questionNumber: 2, correctOption: 'B' },
  { questionNumber: 3, correctOption: 'C' },
  { questionNumber: 4, correctOption: 'D' },
  { questionNumber: 5, correctOption: 'A' },
  { questionNumber: 6, correctOption: 'B' },
  { questionNumber: 7, correctOption: 'C' },
  { questionNumber: 8, correctOption: 'D' },
  { questionNumber: 9, correctOption: 'A' },
  { questionNumber: 10, correctOption: 'B' }
];

// Construye una fila de bubbleMatrix para una pregunta.
// markedIndex: 0=A, 1=B, 2=C, 3=D, null=sin marcar
// noise: valor base de las demás burbujas
const makeBubbleRow = (questionNumber, markedIndex, density = 0.85, noise = 0.12) => ({
  questionNumber,
  optionsDensity: [0, 1, 2, 3].map((i) => (i === markedIndex ? density : noise + Math.random() * 0.05))
});

// ─── caso 1: hoja perfecta ─────────────────────────────────────────────────────
header('CASO 1 — Hoja perfecta (densidades altas, respuestas correctas)');

const perfectMatrix = ANSWER_KEY.map(({ questionNumber, correctOption }) => {
  const optionIndex = correctOption.charCodeAt(0) - 65; // A=0, B=1...
  return makeBubbleRow(questionNumber, optionIndex, 0.88);
});

console.log(`\nCoordenadas de píxel esperadas a ${DPI} DPI:`);
row('Pregunta', 'Opción', 'X (px)', 'Y (px)', 'mm→px ratio');
ANSWER_KEY.slice(0, 5).forEach(({ questionNumber, correctOption }) => {
  const optIdx = correctOption.charCodeAt(0) - 65;
  const { x, y } = computeExpectedPixelCoords(questionNumber, optIdx, DPI);
  const mmPx = (DPI / 25.4).toFixed(2);
  row(`Q${questionNumber}`, correctOption, x, y, `1mm = ${mmPx}px`);
});
console.log(`  (mostrando primeras 5 de ${TOTAL_QUESTIONS})\n`);

const result1 = detectBubblesFromCoordinateMatrix({ bubbleMatrix: perfectMatrix, totalQuestions: TOTAL_QUESTIONS, dpi: DPI });
const marked1 = result1.filter((r) => r.markedOption !== null).length;
marked1 === TOTAL_QUESTIONS
  ? ok(`Todas las ${TOTAL_QUESTIONS} preguntas detectadas como marcadas`)
  : fail(`Solo ${marked1}/${TOTAL_QUESTIONS} detectadas (threshold=${MARK_DENSITY_THRESHOLD})`);

const eval1 = evaluateAnswerSheet({ sheet: { answers: result1 }, answerKey: ANSWER_KEY });
ok(`Score: ${eval1.rawScore}/${ANSWER_KEY.length} (${eval1.scorePercent}%) — status: ${eval1.status}`);

// ─── caso 2: densidades bajas (escáner de baja calidad) ───────────────────────
header('CASO 2 — Densidades bajas (todas < threshold)');

const lowDensityMatrix = ANSWER_KEY.map(({ questionNumber, correctOption }) => {
  const optionIndex = correctOption.charCodeAt(0) - 65;
  return makeBubbleRow(questionNumber, optionIndex, 0.35, 0.28); // top density = 0.35 < 0.5
});

const result2 = detectBubblesFromCoordinateMatrix({ bubbleMatrix: lowDensityMatrix, totalQuestions: TOTAL_QUESTIONS, dpi: DPI });
const marked2 = result2.filter((r) => r.markedOption !== null).length;
console.log(`  Marcadas: ${marked2}/${TOTAL_QUESTIONS}  (esperado: 0 — todas bajo threshold ${MARK_DENSITY_THRESHOLD})`);
marked2 === 0
  ? ok('Correcto: ninguna detectada porque densidades < threshold')
  : warn(`Inesperado: ${marked2} detectadas con densidades bajas`);

const avgDensity2 = lowDensityMatrix.map((r) => Math.max(...r.optionsDensity)).reduce((a, b) => a + b, 0) / lowDensityMatrix.length;
console.log(`  Densidad máxima promedio: ${avgDensity2.toFixed(3)}  Threshold: ${MARK_DENSITY_THRESHOLD}`);
console.log(`  → Para detectar marcas, el escáner debe reportar density > ${MARK_DENSITY_THRESHOLD}`);

// ─── caso 3: burbujas en el límite exacto del threshold ───────────────────────
header('CASO 3 — Densidades en el límite (0.49 vs 0.51)');

const borderMatrix = [
  makeBubbleRow(1, 0, 0.49, 0.1),  // Q1 opción A density=0.49 → NO marcada
  makeBubbleRow(2, 1, 0.51, 0.1),  // Q2 opción B density=0.51 → SÍ marcada
  makeBubbleRow(3, 2, 0.50, 0.1),  // Q3 opción C density=0.50 → NO marcada (> no ≥)
];

const result3 = detectBubblesFromCoordinateMatrix({ bubbleMatrix: borderMatrix, totalQuestions: 3, dpi: DPI });
result3.forEach((r) => {
  const expected = [null, 'B', null][r.questionNumber - 1];
  const icon = r.markedOption === expected ? '✓' : '✗';
  console.log(`  Q${r.questionNumber}: markedOption=${r.markedOption ?? 'null'} expected=${expected ?? 'null'} ${icon} conf=${r.confidence.toFixed(3)}`);
});

// ─── caso 4: filas faltantes en bubbleMatrix ───────────────────────────────────
header('CASO 4 — bubbleMatrix incompleta (solo tiene Q1, Q3, Q5)');

const sparseMatrix = [
  makeBubbleRow(1, 0, 0.88),
  makeBubbleRow(3, 2, 0.88),
  makeBubbleRow(5, 0, 0.88)
];

const result4 = detectBubblesFromCoordinateMatrix({ bubbleMatrix: sparseMatrix, totalQuestions: 5, dpi: DPI });
const missing4 = result4.filter((r) => r.markedOption === null);
console.log(`  Preguntas sin datos: ${missing4.map((r) => `Q${r.questionNumber}`).join(', ')}`);
missing4.length === 2
  ? ok('Q2 y Q4 ausentes en matrix → correctamente reportadas como null')
  : fail(`Esperaba 2 ausentes, encontró ${missing4.length}`);

// ─── caso 5: bubbleMatrix null/undefined ──────────────────────────────────────
header('CASO 5 — bubbleMatrix es null');
const result5 = detectBubblesFromCoordinateMatrix({ bubbleMatrix: null, totalQuestions: 5, dpi: DPI });
result5.length === 0
  ? ok('Devuelve array vacío cuando bubbleMatrix=null')
  : fail(`Inesperado: devolvió ${result5.length} elementos`);

// ─── resumen de coordenadas de toda la hoja ───────────────────────────────────
header(`COORDENADAS ESPERADAS — Grilla completa a ${DPI} DPI`);
console.log(`  Layout: ${omrCoordinates.columns} columnas × ${omrCoordinates.questionsPerColumn} preguntas/col`);
console.log(`  Página: ${omrCoordinates.pageWidth}×${omrCoordinates.pageHeight} mm`);
console.log(`  Burbuja: diámetro=${omrCoordinates.bubble.diameter}mm spacingX=${omrCoordinates.bubble.spacingX}mm spacingY=${omrCoordinates.bubble.spacingY}mm`);
console.log(`  GridOrigin: x=${omrCoordinates.gridOrigin.x}mm y=${omrCoordinates.gridOrigin.y}mm`);
console.log(`  QR: x=${omrCoordinates.qr.x}mm y=${omrCoordinates.qr.y}mm size=${omrCoordinates.qr.size}mm`);
console.log();

const mmToPx = (mm) => Math.round((mm * DPI) / 25.4);
console.log(`  Página renderizada: ${mmToPx(omrCoordinates.pageWidth)}×${mmToPx(omrCoordinates.pageHeight)} px a ${DPI} DPI`);
console.log(`  QR esperado en: (${mmToPx(omrCoordinates.qr.x)}, ${mmToPx(omrCoordinates.qr.y)}) px — tamaño ${mmToPx(omrCoordinates.qr.size)} px`);
console.log();

console.log(`  Primeras 5 preguntas, opción A:`);
row('Q', 'A(x,y)', 'B(x,y)', 'C(x,y)', 'D(x,y)');
for (let q = 1; q <= Math.min(5, omrCoordinates.columns * omrCoordinates.questionsPerColumn); q++) {
  const coords = [0, 1, 2, 3].map((i) => {
    const { x, y } = computeExpectedPixelCoords(q, i, DPI);
    return `(${x},${y})`;
  });
  row(`Q${q}`, ...coords);
}

console.log(`\n${c.bold}Diagnóstico completado.${c.reset}`);
console.log(`Para logs detallados por pregunta: ${c.cyan}DEBUG_OMR=true node scripts/testOmrDetection.js${c.reset}`);
console.log(`Para simular DPI diferente: ${c.cyan}DPI=300 node scripts/testOmrDetection.js${c.reset}\n`);
