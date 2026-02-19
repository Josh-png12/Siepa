const mongoose = require('mongoose');

const parsedAnswerSchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true, min: 1 },
    markedOption: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', null], default: null },
    confidence: { type: Number, default: 0 }
  },
  { _id: false }
);

const correctionSchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true, min: 1 },
    correctedOption: { type: String, required: true, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }
  },
  { _id: false }
);

const errorSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const physicalAnswerSheetSchema = new mongoose.Schema(
  {
    simulacroId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhysicalSimulacro', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    qrToken: { type: String, required: true, trim: true },
    rawFilePath: { type: String, required: true, trim: true },
    parsedAnswers: { type: [parsedAnswerSchema], default: [] },
    score: { type: Number, default: null },
    theta: { type: Number, default: null },
    status: {
      type: String,
      enum: ['valid', 'needsReview', 'invalid', 'duplicate'],
      default: 'needsReview',
      index: true
    },
    errors: { type: [errorSchema], default: [] },
    manualCorrections: { type: [correctionSchema], default: [] },
    detectionConfidence: { type: Number, default: 0 },
    processedAt: { type: Date, default: null }
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

physicalAnswerSheetSchema.index({ simulacroId: 1 });
physicalAnswerSheetSchema.index({ studentId: 1 });
physicalAnswerSheetSchema.index({ status: 1 });
physicalAnswerSheetSchema.index({ simulacroId: 1, qrToken: 1 }, { unique: true });

module.exports = mongoose.model('PhysicalAnswerSheet', physicalAnswerSheetSchema);
