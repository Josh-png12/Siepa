const mongoose = require('mongoose');

const detectedBlockSchema = new mongoose.Schema(
  {
    label: { type: String, default: '', trim: true },
    areaGuess: { type: String, default: 'Sin clasificar', trim: true },
    pages: { type: [Number], default: [] },
    confidence: { type: Number, default: 0, min: 0, max: 1 }
  },
  { _id: false }
);

const detectedQuestionSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true },
    text: { type: String, default: '', trim: true },
    page: { type: Number, default: null },
    areaGuess: { type: String, default: 'Sin clasificar', trim: true },
    competenciaGuess: { type: String, default: 'Sin clasificar', trim: true },
    nivelGuess: { type: String, default: 'comprender', trim: true },
    answerGuess: { type: String, enum: ['A', 'B', 'C', 'D', 'E', null], default: null },
    options: {
      type: [{
        label: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true },
        text: { type: String, default: '', trim: true }
      }],
      default: []
    },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    flags: { type: [String], default: [] }
  },
  { _id: false }
);

const pdfImportBatchSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionName: { type: String, default: '', trim: true },
    grade: { type: String, default: '', trim: true },
    year: { type: String, default: '', trim: true },
    files: {
      questionsPdfPath: { type: String, default: '' },
      answersPdfPath: { type: String, default: '' }
    },
    status: {
      type: String,
      enum: ['preview', 'imported', 'failed'],
      default: 'preview',
      index: true
    },
    detectedBlocks: { type: [detectedBlockSchema], default: [] },
    detectedQuestions: { type: [detectedQuestionSchema], default: [] },
    pages: {
      type: [{
        pageNumber: { type: Number, required: true },
        text: { type: String, default: '' }
      }],
      default: []
    },
    ocrUsed: { type: Boolean, default: false },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },
    warnings: { type: [String], default: [] },
    errorMessage: { type: String, default: '', trim: true }
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true
  }
);

pdfImportBatchSchema.index({ institutionId: 1, createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('PdfImportBatch', pdfImportBatchSchema);
