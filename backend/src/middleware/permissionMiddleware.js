// backend/src/middleware/permissionMiddleware.js
const Question = require('../models/Question');

const checkQuestionOwnership = async (req, res, next) => {
  const { id } = req.params;
  const question = await Question.findById(id);
  if (!question) return res.status(404).json({ message: 'Pregunta no encontrada' });

  if (req.user.role !== 'admin' && question.metadata.createdBy.toString() !== req.user.id) {
    return res.status(403).json({ message: 'No tienes permiso' });
  }
  next();
};

module.exports = { checkQuestionOwnership };