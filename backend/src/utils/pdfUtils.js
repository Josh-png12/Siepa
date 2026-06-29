const jsPDF = require('jspdf');

const generatePDF = (booklet) => {
  const doc = new jsPDF();
  doc.text(booklet.title, 10, 10);
  booklet.questions.forEach((q, index) => {
    doc.text(`${index + 1}. ${q.questionText}`, 10, 20 + index * 20);
    q.options.forEach((opt, optIndex) => {
      doc.text(`${String.fromCharCode(65 + optIndex)}. ${opt}`, 15, 30 + index * 20 + optIndex * 10);
    });
  });
  return doc.output('arraybuffer'); // Para enviar como buffer
};

module.exports = { generatePDF };