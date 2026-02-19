// backend/src/services/evaluationService.js
const Response = require('../models/Response');
const Report = require('../models/Report');
const Booklet = require('../models/Booklet');
const Question = require('../models/Question');

const startEvaluation = async (bookletId, studentId) => {
  const response = new Response({
    booklet: bookletId,
    student: studentId,
    startTime: new Date(),
  });
  await response.save();
  return response;
};

const submitResponses = async (responseId, answers) => {
  const response = await Response.findById(responseId);
  response.answers = answers;
  response.endTime = new Date();
  await response.save();

  // Calificación automática
  const booklet = await Booklet.findById(response.booklet).populate('questions');
  let score = 0;
  const byCompetencia = {};

  booklet.questions.forEach((q, index) => {
    const userAnswer = answers.find(a => a.questionId.toString() === q._id.toString())?.selectedOption;
    if (userAnswer === q.correctAnswer) score++;

    if (!byCompetencia[q.competencia]) {
      byCompetencia[q.competencia] = { correct: 0, total: 0 };
    }
    byCompetencia[q.competencia].total++;
    if (userAnswer === q.correctAnswer) byCompetencia[q.competencia].correct++;
  });

  const competenciaArray = Object.keys(byCompetencia).map(comp => {
    const data = byCompetencia[comp];
    const porcentaje = (data.correct / data.total) * 100;
    return {
      competencia: comp,
      correct: data.correct,
      total: data.total,
      fortalezas: porcentaje > 70 ? ['Buen dominio'] : [],
      debilidades: porcentaje < 50 ? ['Necesita refuerzo'] : [],
    };
  });

  const report = new Report({
    response: response._id,
    score,
    byCompetencia: competenciaArray,
    recomendaciones: ['Revisar temas débiles', 'Practicar más evidencias'], // Lógica más avanzada en futuro
  });
  await report.save();

  return report;
};

module.exports = { startEvaluation, submitResponses };