const { jsPDF } = require('jspdf');

const drawSectionTitle = (doc, text, x, y) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(10, 46, 87);
  doc.text(text, x, y);
};

const drawTag = (doc, text, x, y, fill = [235, 243, 255]) => {
  const width = doc.getTextWidth(text) + 8;
  doc.setFillColor(...fill);
  doc.roundedRect(x, y - 5, width, 7, 2, 2, 'F');
  doc.setFontSize(9);
  doc.setTextColor(10, 46, 87);
  doc.text(text, x + 4, y);
  return width + 3;
};

const renderBars = ({ doc, rows, x, y, width, color }) => {
  if (!rows.length) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Sin datos', x, y);
    return y + 6;
  }

  let currentY = y;
  rows.forEach((row) => {
    const label = row.label;
    const value = Number(row.value || 0);
    const pct = Math.max(0, Math.min(100, value * 100));

    doc.setFontSize(9);
    doc.setTextColor(20);
    doc.text(label, x, currentY);
    doc.setFillColor(240, 242, 245);
    doc.rect(x, currentY + 1.5, width, 4, 'F');
    doc.setFillColor(...color);
    doc.rect(x, currentY + 1.5, (width * pct) / 100, 4, 'F');
    doc.setTextColor(70);
    doc.text(`${(value).toFixed(2)}`, x + width + 3, currentY + 4);
    currentY += 9;
  });
  return currentY;
};

const generateTeacherCourseReportPdf = ({ insights, generatedAt }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 46, 87);
  doc.rect(0, 0, pageWidth, 24, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SIEPA - Reporte Profesional de Curso', 14, 12);
  doc.setFontSize(10);
  doc.text(`Generado: ${new Date(generatedAt).toLocaleString('es-CO')}`, 14, 18);

  doc.setTextColor(18, 24, 38);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${insights.course.name} (${insights.course.grade})`, 14, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Ano lectivo: ${insights.course.year || 'N/A'}`, 14, 40);

  drawSectionTitle(doc, 'Resumen Ejecutivo', 14, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Estudiantes: ${insights.metrics.totalStudents}`, 14, 56);
  doc.text(`Theta promedio: ${Number(insights.metrics.averageTheta || 0).toFixed(2)}`, 65, 56);
  doc.text(`Proyeccion Saber 11: ${insights.metrics.projectedSaber11Score}`, 120, 56);
  doc.text(`Estudiantes en riesgo: ${insights.metrics.atRiskStudents}`, 14, 62);
  doc.text(`Competencia mas debil: ${insights.metrics.weakestCompetency}`, 65, 62);

  drawSectionTitle(doc, 'Distribucion de Competencias', 14, 73);
  const competencyRows = (insights.charts.competencyBreakdown || []).slice(0, 6).map((row) => ({
    label: row.competency,
    value: (Number(row.avgTheta || 0) + 3) / 6
  }));
  let cursorY = renderBars({
    doc,
    rows: competencyRows,
    x: 14,
    y: 78,
    width: 70,
    color: [99, 179, 46]
  });

  drawSectionTitle(doc, 'Comparativo de Rendimiento por Curso', 100, 73);
  const comparisonRows = (insights.charts.comparison || []).slice(0, 6).map((row) => ({
    label: row.courseName,
    value: (Number(row.avgTheta || 0) + 3) / 6
  }));
  cursorY = Math.max(cursorY, renderBars({
    doc,
    rows: comparisonRows,
    x: 100,
    y: 78,
    width: 70,
    color: [10, 46, 87]
  }));

  drawSectionTitle(doc, 'Estudiantes en Riesgo', 14, cursorY + 6);
  const atRisk = (insights.atRiskStudents || []).slice(0, 8);
  if (!atRisk.length) {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text('No hay estudiantes en riesgo alto/medio segun reglas de seguimiento.', 14, cursorY + 12);
    cursorY += 16;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(40);
    let rowY = cursorY + 11;
    atRisk.forEach((row) => {
      doc.text(row.name, 14, rowY);
      doc.text(`Theta ${Number(row.theta || 0).toFixed(2)}`, 70, rowY);
      doc.text(`${row.status.toUpperCase()}`, 100, rowY);
      doc.text(`${row.daysWithoutActivity} dias sin actividad`, 130, rowY);
      rowY += 5;
    });
    cursorY = rowY + 2;
  }

  drawSectionTitle(doc, 'Acciones Recomendadas', 14, cursorY + 4);
  doc.setFontSize(9);
  doc.setTextColor(35);
  (insights.insights.recommendedActions || []).slice(0, 4).forEach((action, index) => {
    doc.text(`${index + 1}. ${action}`, 14, cursorY + 10 + (index * 5));
  });

  let chipX = 14;
  const chipY = cursorY + 34;
  drawSectionTitle(doc, 'Etiquetas sugeridas del banco', 14, chipY - 3);
  (insights.insights.suggestedQuestionTags || []).slice(0, 8).forEach((item) => {
    chipX += drawTag(doc, `${item.tag} (${item.availableQuestions})`, chipX, chipY);
    if (chipX > 170) chipX = 14;
  });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
};

module.exports = {
  generateTeacherCourseReportPdf
};
