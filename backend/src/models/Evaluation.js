// backend/src/models/Evaluation.js
const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booklet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booklet',
    required: false
  },
  physicalSimulacro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimulacroPhysical',
    required: false
  },
  evaluationType: {
    type: String,
    enum: ['virtual', 'physical'],
    default: 'virtual',
    index: true
  },
  responses: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    selectedOption: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    status: {
      type: String,
      enum: ['valid', 'blank', 'invalid_multiple', 'invalid_erasure'],
      default: 'valid'
    },
    correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    isCorrect: { type: Boolean, default: false }
  }],
  theta: Number,
  globalScore: Number,
  percentile: { type: Number, default: 50 },
  physicalMeta: {
    rawScore: { type: Number, default: 0 },
    percentCorrect: { type: Number, default: 0 },
    competencyBreakdown: [
      {
        competencia: String,
        correct: Number,
        total: Number
      }
    ],
    scannedSheetPath: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'paused'],
    default: 'in-progress'
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Evaluation', evaluationSchema);
