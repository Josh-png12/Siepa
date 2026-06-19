const prisma = require('../config/prisma');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const buildError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const calculateDiscriminationIndex = ({ correctThetas = [], wrongThetas = [] }) => {
  if (!correctThetas.length || !wrongThetas.length) return 0;

  const mean = (arr) => arr.reduce((sum, value) => sum + value, 0) / arr.length;
  const diff = mean(correctThetas) - mean(wrongThetas);

  return Number(clamp(Math.tanh(diff / 2), -1, 1).toFixed(4));
};

const updateQuestionStatsFromResponses = async (responses = []) => {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw buildError('responses debe ser un arreglo no vacio', 400);
  }

  const grouped = responses.reduce((acc, item) => {
    if (!item.questionId) return acc;
    const key = String(item.questionId);
    if (!acc[key]) {
      acc[key] = { total: 0, correct: 0, wrongThetas: [], correctThetas: [] };
    }

    const isCorrect = Boolean(item.isCorrect);
    const theta = Number(item.theta || 0);

    acc[key].total += 1;
    if (isCorrect) {
      acc[key].correct += 1;
      acc[key].correctThetas.push(theta);
    } else {
      acc[key].wrongThetas.push(theta);
    }

    return acc;
  }, {});

  const ids = Object.keys(grouped);

  const questions = await prisma.question.findMany({
    where: { id: { in: ids } }
  });

  const updated = [];

  for (const question of questions) {
    const data = grouped[question.id];
    const prevTimesUsed = question.statsTimesUsed || 0;
    const prevCorrectRate = question.statsCorrectRate || 0;

    const newTimesUsed = prevTimesUsed + data.total;
    const batchCorrectRate = data.correct / data.total;
    const newCorrectRate =
      newTimesUsed === 0
        ? 0
        : (prevCorrectRate * prevTimesUsed + batchCorrectRate * data.total) / newTimesUsed;

    const prevWrongCount = Math.max(
      prevTimesUsed - Math.round(prevCorrectRate * prevTimesUsed),
      0
    );
    const prevAvgThetaWrong = question.statsAvgThetaWrong || 0;
    const newWrongCount = prevWrongCount + data.wrongThetas.length;

    const batchWrongAvg = data.wrongThetas.length
      ? data.wrongThetas.reduce((sum, value) => sum + value, 0) / data.wrongThetas.length
      : 0;

    const newAvgThetaWrong =
      newWrongCount === 0
        ? 0
        : (prevAvgThetaWrong * prevWrongCount + batchWrongAvg * data.wrongThetas.length) /
          newWrongCount;

    await prisma.question.update({
      where: { id: question.id },
      data: {
        statsTimesUsed: newTimesUsed,
        statsCorrectRate: Number(clamp(newCorrectRate, 0, 1).toFixed(6)),
        statsAvgThetaWrong: Number(newAvgThetaWrong.toFixed(6)),
        statsDiscriminationIndex: calculateDiscriminationIndex({
          correctThetas: data.correctThetas,
          wrongThetas: data.wrongThetas
        })
      }
    });

    updated.push(question.id);
  }

  return { updatedCount: updated.length, ids: updated };
};

module.exports = {
  updateQuestionStatsFromResponses,
  calculateDiscriminationIndex
};
