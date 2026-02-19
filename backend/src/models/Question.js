const mongoose = require('mongoose');

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    caption: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, enum: OPTION_LABELS },
    text: { type: String, required: true, trim: true },
    image: { type: imageSchema, default: null }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    statement: {
      text: { type: String, trim: true, default: '' },
      images: { type: [imageSchema], default: [] }
    },
    latex: { type: String, trim: true, default: '' },
    options: {
      type: [optionSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length >= 4 && value.length <= 8;
        },
        message: 'La pregunta debe tener entre 4 y 8 opciones'
      }
    },
    correctAnswer: { type: String, required: true, enum: OPTION_LABELS },

    area: { type: String, required: true, trim: true, index: true },
    competencia: { type: String, required: true, trim: true, index: true },
    nivelCognitivo: {
      type: String,
      enum: ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'],
      default: 'comprender',
      index: true
    },
    dificultadCualitativa: {
      type: String,
      enum: ['baja', 'media', 'alta'],
      required: true,
      index: true
    },

    triParams: {
      a: { type: Number, min: 0.01, max: 3, default: 1.0 },
      b: { type: Number, min: -3, max: 3, default: 0.0, index: true },
      c: { type: Number, min: 0, max: 0.5, default: 0.2 }
    },

    visibility: {
      type: String,
      enum: ['private', 'institutional', 'national'],
      default: 'private',
      index: true
    },
    calibrationStatus: {
      type: String,
      enum: ['experimental', 'calibrated'],
      default: 'experimental',
      index: true
    },
    estado: {
      type: String,
      enum: ['borrador', 'publicada'],
      default: 'borrador',
      index: true
    },

    stats: {
      timesUsed: { type: Number, default: 0, min: 0 },
      correctRate: { type: Number, default: 0, min: 0, max: 1 },
      discriminationIndex: { type: Number, default: 0, min: -1, max: 1 },
      avgThetaWrong: { type: Number, default: 0 }
    },

    caseGroup: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CaseGroup',
      default: null,
      index: true
    },
    source: {
      type: {
        type: String,
        enum: ['pdf', 'manual', 'excel', 'ocr'],
        default: 'manual'
      },
      pdfId: { type: mongoose.Schema.Types.ObjectId, ref: 'PdfImportBatch', default: null },
      sessionName: { type: String, trim: true, default: '' },
      pageStart: { type: Number, default: null },
      pageEnd: { type: Number, default: null },
      blockLabel: { type: String, trim: true, default: '' }
    },
    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PdfImportBatch',
      default: null,
      index: true
    },

    currentVersion: { type: Number, default: 1, min: 1 },

    metadata: {
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    }
  },
  { timestamps: true }
);

questionSchema.index({ institutionId: 1, area: 1, competencia: 1, dificultadCualitativa: 1 });
questionSchema.index({ 'metadata.createdBy': 1, visibility: 1, calibrationStatus: 1 });
questionSchema.index({ updatedAt: -1 });
questionSchema.index({ institutionId: 1, area: 1, competencia: 1, createdAt: -1 });

questionSchema.pre('validate', function validateQuestion(next) {
  const hasText = Boolean(this.statement?.text && this.statement.text.trim());
  const hasLatex = Boolean(this.latex && this.latex.trim());
  if (!hasText && !hasLatex) {
    return next(new Error('Debe existir statement.text o latex'));
  }

  const labels = (this.options || []).map((opt) => opt.label);
  const uniqueLabels = new Set(labels);
  if (labels.length !== uniqueLabels.size) {
    return next(new Error('Las opciones tienen etiquetas duplicadas'));
  }

  if (!labels.includes(this.correctAnswer)) {
    return next(new Error('correctAnswer debe estar presente dentro de options'));
  }

  return next();
});

module.exports = mongoose.model('Question', questionSchema);
