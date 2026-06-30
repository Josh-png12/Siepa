'use strict';

const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const qrcode = require('qrcode');

const OUTPUT_BASE = path.join(process.cwd(), 'uploads', 'physical-simulacros');

// ─── PAGE DIMENSIONS (mm, US Letter) ─────────────────────────────────────────
const PW = 216;
const PH = 279;
const MG = 8;   // all-sides margin

// ─── HEADER LAYOUT ────────────────────────────────────────────────────────────
// QR: top-right, 24×24 mm
const QR_SZ = 24;
const QR_X  = PW - MG - QR_SZ;   // x=184
const QR_Y  = MG;                 // y=8

// Candidate info zone (below QR)
const NAME_LBL_Y = QR_Y + QR_SZ + 5;        // y=37
const NAME_BOX_Y = NAME_LBL_Y + 2;          // y=39
const NAME_BOX_H = 8;                        // 8 mm tall
const DOC_Y      = NAME_BOX_Y + NAME_BOX_H + 5; // y=52
const DIV_Y      = DOC_Y + 4;               // y=56  — horizontal rule
const COL_Y0     = DIV_Y + 3;               // y=59  — columns start

// ─── COLUMN LAYOUT ────────────────────────────────────────────────────────────
const NCOLS = 5;
const COL_W = (PW - 2 * MG) / NCOLS;  // 40 mm per column
const QNUMW = 5.5;                     // left field reserved for question number
const ROW_H = 5.0;                     // mm per question row
const SEP_H = 4.5;                     // mm per area-separator row

// ─── COLORS (RGB) ────────────────────────────────────────────────────────────
const C_ALT   = [238, 244, 255];   // #EEF4FF — alternating question rows
const C_SOCIO = [235, 255, 235];   // light green — socioeconómico alternate rows
const C_SOCIO0= [248, 255, 248];   // lighter green — socioeconómico non-alternate
const C_SEP   = [173, 200, 240];   // blue — area separator band
const C_SEPC  = [140, 195, 160];   // green — socioeconómico separator
const C_STXT  = [0,  30, 100];     // separator label text
const C_BLUE  = [0,  60, 140];     // SIEPA brand blue

// ─── SESSION CONFIGURATION ───────────────────────────────────────────────────
const SESSIONS = {
  SESION_1: {
    label: 'SESIÓN 1 — Saber 11',
    areas: [
      { name: 'MATEMÁTICAS',           start: 1,   end: 25  },
      { name: 'LECTURA CRÍTICA',       start: 26,  end: 66  },
      { name: 'SOCIALES Y CIUDADANAS', start: 67,  end: 91  },
      { name: 'CIENCIAS NATURALES',    start: 92,  end: 120 },
      { name: 'C. SOCIOECONÓMICO',     start: 121, end: 131, socio: true }
    ],
    columns: [
      { start: 1,   end: 35  },
      { start: 36,  end: 70  },
      { start: 71,  end: 105 },
      { start: 106, end: 131 },
      null
    ]
  },
  SESION_2: {
    label: 'SESIÓN 2 — Saber 11',
    areas: [
      { name: 'MATEMÁTICAS',           start: 1,   end: 25  },
      { name: 'SOCIALES Y CIUDADANAS', start: 26,  end: 50  },
      { name: 'CIENCIAS NATURALES',    start: 51,  end: 79  },
      { name: 'INGLÉS',                start: 80,  end: 134 },
      { name: 'C. SOCIOECONÓMICO',     start: 135, end: 147, socio: true }
    ],
    columns: [
      { start: 1,   end: 35  },
      { start: 36,  end: 70  },
      { start: 71,  end: 105 },
      { start: 106, end: 140 },
      { start: 141, end: 147 }
    ]
  }
};

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };

const saveDoc = async (doc, target) => {
  ensureDir(path.dirname(target));
  await fs.promises.writeFile(target, Buffer.from(doc.output('arraybuffer')));
};

const addRealQr = async (doc, payload, x, y, size) => {
  try {
    const dataUrl = await qrcode.toDataURL(payload, {
      width: 512, margin: 1, errorCorrectionLevel: 'M'
    });
    doc.addImage(dataUrl, 'PNG', x, y, size, size);
  } catch {
    doc.setDrawColor(0);
    doc.line(x, y, x + size, y + size);
    doc.line(x + size, y, x, y + size);
  }
};

const addSandboxWatermark = (doc) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(44);
  doc.setTextColor(210, 30, 30);
  doc.text('PRUEBA - NO VÁLIDO', 108, 148, { align: 'center', angle: 45 });
  doc.setTextColor(0, 0, 0);
};

// Returns the area config object for a given question number, or null.
const areaFor = (areas, q) => areas.find(a => q >= a.start && q <= a.end) || null;

// Returns the answer option letters for a question.
// Session 2 special cases: Inglés 130-134 → A-H, Socio 135-147 → A-C.
const optsFor = (sessionKey, q) => {
  if (sessionKey === 'SESION_2') {
    if (q >= 130 && q <= 134) return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    if (q >= 135)             return ['A', 'B', 'C'];
  }
  return ['A', 'B', 'C', 'D'];
};

// X-centers for bubbles evenly distributed in the bubble area of a column.
const bubbleXs = (colX, n) => {
  const bw = COL_W - QNUMW;  // 34.5 mm bubble zone
  const sp = bw / n;
  return Array.from({ length: n }, (_, i) => colX + QNUMW + sp * (i + 0.5));
};

// Bubble radius by option count.
// At 200 dpi: r=2mm → diameter=4mm → 31px (>18px ✓); r=1.55 → 3.1mm → 24px (✓).
const bubbleR = (n) => (n <= 4 ? 2.0 : n <= 6 ? 1.7 : 1.55);

// ─── DRAWING PRIMITIVES ───────────────────────────────────────────────────────

// 3×3 mm filled squares at page corners for OMR alignment.
const drawCorners = (doc) => {
  doc.setFillColor(0, 0, 0);
  [[MG, MG], [PW - MG - 3, MG], [MG, PH - MG - 3], [PW - MG - 3, PH - MG - 3]]
    .forEach(([x, y]) => doc.rect(x, y, 3, 3, 'F'));
};

const drawAreaSep = (doc, colX, y, label, socio) => {
  const bg = socio ? C_SEPC : C_SEP;
  doc.setFillColor(...bg);
  doc.rect(colX, y, COL_W, SEP_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(...C_STXT);
  doc.text(label, colX + 1, y + SEP_H - 1.2);
  doc.setTextColor(0, 0, 0);
};

const drawQuestionRow = (doc, colX, y, q, opts, socio, alt) => {
  // Alternating / socio background
  if (alt || socio) {
    const bg = socio ? (alt ? C_SOCIO : C_SOCIO0) : C_ALT;
    doc.setFillColor(...bg);
    doc.rect(colX, y, COL_W, ROW_H, 'F');
  }

  // Question number, right-aligned within QNUMW
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(0, 0, 0);
  doc.text(String(q), colX + QNUMW - 0.5, y + ROW_H - 1.5, { align: 'right' });

  // Bubble circles with letter inside
  const r    = bubbleR(opts.length);
  const xs   = bubbleXs(colX, opts.length);
  const midY = y + ROW_H / 2;
  const fsz  = opts.length > 4 ? 4 : 5;

  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);

  opts.forEach((ltr, i) => {
    doc.circle(xs[i], midY, r);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fsz);
    // baseline at midY + ~half ascent so letter appears centered in circle
    doc.text(ltr, xs[i], midY + r * 0.45, { align: 'center' });
  });
};

const drawColumnGrid = (doc) => {
  // Vertical column dividers
  doc.setLineWidth(0.2);
  doc.setDrawColor(155, 155, 155);
  for (let c = 1; c < NCOLS; c++) {
    const x = MG + c * COL_W;
    doc.line(x, COL_Y0, x, PH - MG);
  }
  // Outer border around column area
  doc.setLineWidth(0.4);
  doc.setDrawColor(80, 80, 80);
  doc.rect(MG, COL_Y0, PW - 2 * MG, PH - COL_Y0 - MG);
  doc.setDrawColor(0, 0, 0);
};

// ─── COLUMN RENDERER ──────────────────────────────────────────────────────────
const renderColumn = (doc, colIdx, sessionKey, range) => {
  if (!range) return;

  const areas = SESSIONS[sessionKey].areas;
  const colX  = MG + colIdx * COL_W;
  let y       = COL_Y0;
  let alt     = 0;
  let prevArea = null;

  // First area header (always drawn at column top)
  const firstArea = areaFor(areas, range.start);
  if (firstArea) {
    drawAreaSep(doc, colX, y, firstArea.name, firstArea.socio || false);
    y += SEP_H;
    prevArea = firstArea;
  }

  for (let q = range.start; q <= range.end; q++) {
    const area = areaFor(areas, q);

    // Separator when crossing into a new area mid-column
    if (area && area !== prevArea) {
      drawAreaSep(doc, colX, y, area.name, area.socio || false);
      y += SEP_H;
      prevArea = area;
      alt = 0; // reset stripe count after each separator
    }

    const opts  = optsFor(sessionKey, q);
    const socio = area?.socio || false;
    drawQuestionRow(doc, colX, y, q, opts, socio, alt % 2 === 1);
    y += ROW_H;
    alt++;
  }
};

// ─── EXAM PDF (enunciado — unchanged logic) ───────────────────────────────────
const renderExamPdf = async ({ student, simulacro, questions, destinationPath, isSandbox = false }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SIEPA - Simulacro Fisico', 15, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Simulacro ID: ${simulacro.simulacroPhysicalId}`, 15, 22);
  doc.text(`Estudiante: ${student.studentName}`, 15, 27);
  doc.text(`Documento: ${student.studentDocument || '-'}`, 15, 32);
  doc.text(`Curso: ${student.courseName || '-'}`, 15, 37);
  doc.text(`Fecha: ${new Date(simulacro.date).toLocaleDateString()}`, 15, 42);

  await addRealQr(doc, student.qrPayload, 176, 15, 25);

  let y = 50;
  questions.forEach((question, index) => {
    if (y > 262) { doc.addPage('letter', 'portrait'); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}.`, 15, y);
    doc.setFont('helvetica', 'normal');
    const text = question.statement?.text || question.latex || '(sin enunciado)';
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 22, y);
    y += Math.max(6, lines.length * 4);
    const optLine  = (question.options || []).map(o => `${o.label}) ${o.text}`).join('   ');
    const optLines = doc.splitTextToSize(optLine, 170);
    doc.text(optLines, 22, y);
    y += Math.max(8, optLines.length * 4 + 2);
  });

  if (isSandbox) addSandboxWatermark(doc);
  await saveDoc(doc, destinationPath);
};

// ─── ICFES OMR PDF ────────────────────────────────────────────────────────────
const renderOmrPdf = async ({
  student,
  simulacro,
  destinationPath,
  isSandbox = false,
  session = 'SESION_1'
}) => {
  const cfg = SESSIONS[session] || SESSIONS.SESION_1;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  // ── Header: brand + session label ───────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...C_BLUE);
  doc.text('SIEPA', MG, MG + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('Hoja de Respuestas Oficial', MG, MG + 14);

  doc.setFontSize(7);
  doc.text(cfg.label, MG, MG + 20);

  // ── QR code ──────────────────────────────────────────────────────────────────
  await addRealQr(doc, student.qrPayload, QR_X, QR_Y, QR_SZ);

  // ── APELLIDOS Y NOMBRES (empty — filled by student in pen) ────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text('APELLIDOS Y NOMBRES:', MG, NAME_LBL_Y);
  doc.setLineWidth(0.4);
  doc.setDrawColor(80, 80, 80);
  doc.rect(MG, NAME_BOX_Y, PW - 2 * MG, NAME_BOX_H);

  // ── DOCUMENTO: printed (from User.documentNumber) ────────────────────────
  const dtLabel = String(student.documentType || 'TI');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text(`DOCUMENTO (${dtLabel}):`, MG, DOC_Y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(student.studentDocument || '—'), MG + 36, DOC_Y);

  // ── Blue divider ──────────────────────────────────────────────────────────
  doc.setLineWidth(0.6);
  doc.setDrawColor(...C_BLUE);
  doc.line(MG, DIV_Y, PW - MG, DIV_Y);

  // ── Column grid + corner markers ──────────────────────────────────────────
  drawColumnGrid(doc);
  drawCorners(doc);

  // ── Column content ────────────────────────────────────────────────────────
  cfg.columns.forEach((range, colIdx) => renderColumn(doc, colIdx, session, range));

  if (isSandbox) addSandboxWatermark(doc);
  await saveDoc(doc, destinationPath);
};

// ─── MAIN EXPORT: generate exam + OMR PDFs per student ───────────────────────
const generateStudentDocuments = async ({
  simulacro,
  students,
  questions,
  isSandbox = false
}) => {
  const runFolder  = path.join(OUTPUT_BASE, simulacro.simulacroPhysicalId);
  const examFolder = path.join(runFolder, 'exam');
  const omrFolder  = path.join(runFolder, 'omr');
  ensureDir(examFolder);
  ensureDir(omrFolder);

  const session = simulacro.session || 'SESION_1';
  const isAmbas = session === 'AMBAS';
  const base    = `/uploads/physical-simulacros/${simulacro.simulacroPhysicalId}`;
  const packages = [];

  for (const student of students) {
    const examFile = `${student.studentId}-exam.pdf`;
    await renderExamPdf({
      student, simulacro, questions,
      destinationPath: path.join(examFolder, examFile),
      isSandbox
    });

    if (isAmbas) {
      // AMBAS: generate one OMR sheet per session
      const f1 = `${student.studentId}-omr-s1.pdf`;
      const f2 = `${student.studentId}-omr-s2.pdf`;
      await renderOmrPdf({ student, simulacro, destinationPath: path.join(omrFolder, f1), isSandbox, session: 'SESION_1' });
      await renderOmrPdf({ student, simulacro, destinationPath: path.join(omrFolder, f2), isSandbox, session: 'SESION_2' });
      packages.push({
        ...student,
        examPdfPath:  `${base}/exam/${examFile}`,
        // omrPdfPath points to S1 (used for pdfHash — S1 is the primary)
        omrPdfPath:   `${base}/omr/${f1}`,
        omrPdfPathS1: `${base}/omr/${f1}`,
        omrPdfPathS2: `${base}/omr/${f2}`
      });
    } else {
      const f = `${student.studentId}-omr.pdf`;
      await renderOmrPdf({ student, simulacro, destinationPath: path.join(omrFolder, f), isSandbox, session });
      packages.push({
        ...student,
        examPdfPath: `${base}/exam/${examFile}`,
        omrPdfPath:  `${base}/omr/${f}`
      });
    }
  }

  return {
    generatedBundlePath: base,
    studentPackages: packages
  };
};

const mmToPt = (mm) => (mm * 72) / 25.4;

module.exports = { generateStudentDocuments, mmToPt, SESSIONS };
