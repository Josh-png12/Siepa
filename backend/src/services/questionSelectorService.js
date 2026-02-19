const Question = require('../models/Question');

const buildSimulacroByDifficulty = async ({
  areas,
  totalQuestions,
  targetDifficulty // -2 a +2
}) => {

  const questions = await Question.aggregate([
    {
      $match: {
        area: { $in: areas },
        estado: 'publicada'
      }
    },
    {
      $addFields: {
        difficultyGap: {
          $abs: { $subtract: ['$triParams.b', targetDifficulty] }
        }
      }
    },
    { $sort: { difficultyGap: 1 } },
    { $limit: totalQuestions }
  ]);

  return questions.map(q => q._id);
};

module.exports = { buildSimulacroByDifficulty };
