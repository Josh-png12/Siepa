const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
    selectedOption: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], required: true },
    isCorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const moduleTimeSchema = new mongoose.Schema(
  {
    moduleName: { type: String, required: true },
    secondsSpent: { type: Number, min: 0, default: 0 }
  },
  { _id: false }
);

const thetaSchema = new mongoose.Schema(
  {
    moduleName: { type: String, required: true },
    theta: { type: Number, default: 0 }
  },
  { _id: false }
);

const simulacroResultSchema = new mongoose.Schema(
  {
    simulacroId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Simulacro',
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    answers: {
      type: [answerSchema],
      default: []
    },
    markedForReview: {
      type: [mongoose.Schema.Types.ObjectId],
      default: []
    },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date, default: null },
    moduleTimes: {
      type: [moduleTimeSchema],
      default: []
    },
    thetasByModule: {
      type: [thetaSchema],
      default: []
    },
    overallTheta: { type: Number, default: 0 },
    percentile: { type: Number, default: 50 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
      index: true
    }
  },
  { timestamps: true }
);

simulacroResultSchema.index({ simulacroId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model('SimulacroResult', simulacroResultSchema);
