const { jsPDF } = require('jspdf');

const generateInstitutionReportPdf = ({ institutionId, metrics, governance }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 46, 87);
  doc.rect(0, 0, width, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('SIEPA - Reporte Institucional', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Institucion: ${institutionId}`, 14, 18);
  doc.text(`Fecha: ${new Date().toLocaleString('es-CO')}`, 14, 23);

  doc.setTextColor(20, 25, 40);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen Global', 14, 38);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Riesgo Cognitivo (indice): ${Number(metrics?.metrics?.riskCognitiveIndex || 0).toFixed(4)}`, 14, 45);
  doc.text(`OCR Esperadas: ${governance?.totals?.expected || 0}`, 14, 51);
  doc.text(`OCR Recibidas: ${governance?.totals?.received || 0}`, 14, 57);
  doc.text(`OCR Pendientes: ${governance?.totals?.pending || 0}`, 14, 63);
  doc.text(`Tasa Duplicados: ${(Number(governance?.duplicateRate || 0) * 100).toFixed(2)}%`, 14, 69);

  doc.setFont('helvetica', 'bold');
  doc.text('Comparativo por Curso', 14, 82);
  doc.setFont('helvetica', 'normal');
  const courseRows = metrics?.metrics?.crossCourseComparison || [];
  let y = 88;
  courseRows.slice(0, 12).forEach((row) => {
    doc.text(`Curso ${row.courseId}: theta ${Number(row.avgTheta || 0).toFixed(2)} | riesgo ${row.riskStudents || 0}`, 14, y);
    y += 5;
  });

  doc.setFont('helvetica', 'bold');
  doc.text('Desglose de Competencias', 14, y + 6);
  doc.setFont('helvetica', 'normal');
  y += 12;
  const competencyRows = metrics?.metrics?.competencyBreakdown || [];
  competencyRows.slice(0, 10).forEach((row) => {
    doc.text(`${row.competencia}: theta ${Number(row.avgTheta || 0).toFixed(2)} (n=${row.sampleSize || 0})`, 14, y);
    y += 5;
  });

  doc.setFont('helvetica', 'bold');
  doc.text('Gobernanza OCR por Curso', 14, y + 6);
  doc.setFont('helvetica', 'normal');
  y += 12;
  (governance?.byCourse || []).slice(0, 10).forEach((row) => {
    doc.text(
      `${row.courseName}: ${row.sheetsReceived}/${row.sheetsExpected} recibidas, ${row.pendingReview} pendientes`,
      14,
      y
    );
    y += 5;
  });

  return Buffer.from(doc.output('arraybuffer'));
};

module.exports = {
  generateInstitutionReportPdf
};
