const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');
const qrcode = require('qrcode');
const omrCoordinates = require('../config/omrCoordinates.json');

const OUTPUT_BASE = path.join(process.cwd(), 'uploads', 'physical-simulacros');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const mmToPt = (mm) => (mm * 72) / 25.4;

const addRealQr = async (doc, payload, x, y, size) => {
  try {
    const dataUrl = await qrcode.toDataURL(payload, {
      width: 512,
      margin: 1,
      errorCorrectionLevel: 'M'
    });
    doc.addImage(dataUrl, 'PNG', x, y, size, size);
  } catch (_error) {
    // Fallback: draw a simple X so the position is visible even if QR generation fails
    doc.setDrawColor(0);
    doc.line(x, y, x + size, y + size);
    doc.line(x + size, y, x, y + size);
  }
};

const saveDoc = async (doc, targetPath) => {
  ensureDir(path.dirname(targetPath));
  const buffer = Buffer.from(doc.output('arraybuffer'));
  await fs.promises.writeFile(targetPath, buffer);
};

const renderExamPdf = async ({ student, simulacro, questions, destinationPath }) => {
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
    if (y > 262) {
      doc.addPage('letter', 'portrait');
      y = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`${index + 1}.`, 15, y);
    doc.setFont('helvetica', 'normal');

    const text = question.statement?.text || question.latex || '(sin enunciado)';
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 22, y);

    y += Math.max(6, lines.length * 4);

    const optionLine = (question.options || []).map((option) => `${option.label}) ${option.text}`).join('   ');
    const optionLines = doc.splitTextToSize(optionLine, 170);
    doc.text(optionLines, 22, y);
    y += Math.max(8, optionLines.length * 4 + 2);
  });

  await saveDoc(doc, destinationPath);
};

const renderOmrPdf = async ({ student, simulacro, destinationPath }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  const originX = omrCoordinates.gridOrigin.x;
  const originY = omrCoordinates.gridOrigin.y;
  const rowSpacing = omrCoordinates.bubble.spacingY;
  const bubbleDiameter = omrCoordinates.bubble.diameter;
  const spacingX = omrCoordinates.bubble.spacingX;
  const questionsPerColumn = omrCoordinates.questionsPerColumn;
  const options = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('SIEPA - Hoja de Respuestas OMR', 15, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`SimulacroPhysicalID: ${simulacro.simulacroPhysicalId}`, 15, 17);
  doc.text(`Estudiante: ${student.studentName}`, 15, 21);
  doc.text(`ID: ${student.studentDocument || '-'}`, 15, 25);
  doc.text(`Curso: ${student.courseName || '-'}`, 15, 29);

  await addRealQr(doc, student.qrPayload, omrCoordinates.qr.x, omrCoordinates.qr.y, omrCoordinates.qr.size);

  doc.setLineWidth(0.3);

  for (let q = 1; q <= simulacro.questionCount; q += 1) {
    const column = Math.floor((q - 1) / questionsPerColumn);
    const row = (q - 1) % questionsPerColumn;

    const baseX = originX + column * 60;
    const y = originY + row * rowSpacing;

    doc.setFontSize(7);
    doc.text(String(q), baseX - 6, y + 1.5);

    options.forEach((opt, optIndex) => {
      const x = baseX + optIndex * spacingX;
      doc.circle(x, y, bubbleDiameter / 2);
      doc.text(opt, x - 1.3, y + 4);
    });
  }

  // Corner markers for alignment
  const marks = [
    [15, 15],
    [201, 15],
    [15, 264],
    [201, 264]
  ];
  marks.forEach(([x, y]) => {
    doc.rect(x, y, 2.5, 2.5, 'F');
  });

  await saveDoc(doc, destinationPath);
};

const generateStudentDocuments = async ({ simulacro, students, questions }) => {
  const runFolder = path.join(OUTPUT_BASE, simulacro.simulacroPhysicalId);
  const examFolder = path.join(runFolder, 'exam');
  const omrFolder = path.join(runFolder, 'omr');

  ensureDir(examFolder);
  ensureDir(omrFolder);

  const packages = [];

  for (const student of students) {
    const examFileName = `${student.studentId}-exam.pdf`;
    const omrFileName = `${student.studentId}-omr.pdf`;

    const examPath = path.join(examFolder, examFileName);
    const omrPath = path.join(omrFolder, omrFileName);

    await renderExamPdf({
      student,
      simulacro,
      questions,
      destinationPath: examPath
    });

    await renderOmrPdf({
      student,
      simulacro,
      destinationPath: omrPath
    });

    packages.push({
      ...student,
      examPdfPath: `/uploads/physical-simulacros/${simulacro.simulacroPhysicalId}/exam/${examFileName}`,
      omrPdfPath: `/uploads/physical-simulacros/${simulacro.simulacroPhysicalId}/omr/${omrFileName}`
    });
  }

  return {
    generatedBundlePath: `/uploads/physical-simulacros/${simulacro.simulacroPhysicalId}`,
    studentPackages: packages
  };
};

module.exports = {
  generateStudentDocuments,
  mmToPt,
  omrCoordinates
};
