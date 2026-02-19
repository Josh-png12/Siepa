const mongoose = require('mongoose');

const pdfImportOptionSchema = new mongoose.Schema(
  {
    label: { type: String, enum: ['A', 'B', 'C', 'D', 'E'], required: true },
    text: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const pdfImportPreviewQuestionSchema = new mongoose.Schema(
  {
    qNumber: { type: Number, required: true },
    statement: { type: String, default: '', trim: true },
    options: { type: [pdfImportOptionSchema], default: [] },
    detectedAnswer: { type: String, enum: ['A', 'B', 'C', 'D', 'E', null], default: null },
    explanation: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true },
    competencia: { type: String, default: '', trim: true },
    nivelCognitivo: { type: String, default: '', trim: true },
    dificultadCualitativa: { type: String, default: '', trim: true },
    tri: {
      a: { type: Number, default: null },
      b: { type: Number, default: null },
      c: { type: Number, default: null }
    },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    flags: { type: [String], default: [] }
  },
  { _id: false }
);

const pdfImportJobSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: {
      filePath: { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true, min: 0 }
    },
    status: {
      type: String,
      enum: ['draft', 'uploaded', 'extracting', 'parsing', 'previewReady', 'confirmed', 'failed'],
      default: 'draft',
      index: true
    },
    pages: { type: Number, default: 0, min: 0 },
    isScanned: { type: Boolean, default: false },
    ocrEngine: { type: String, enum: ['tesseract', 'pdfText', null], default: null },
    extractedTextPath: { type: String, default: '' },
    parsedJsonPath: { type: String, default: '' },
    preview: {
      questions: { type: [pdfImportPreviewQuestionSchema], default: [] },
      meta: {
        warnings: { type: [String], default: [] },
        stats: { type: mongoose.Schema.Types.Mixed, default: {} }
      }
    },
    errors: {
      type: [{
        type: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true }
      }],
      default: []
    }
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true
  }
);

pdfImportJobSchema.index({ institutionId: 1, createdBy: 1, status: 1 });
pdfImportJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PdfImportJob', pdfImportJobSchema);
