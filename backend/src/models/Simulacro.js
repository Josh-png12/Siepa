const mongoose = require('mongoose');

const MODULE_NAMES = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

const embeddedOptionSchema = new mongoose.Schema(
  {
    label: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    text: { type: String, trim: true },
    image: {
      url: { type: String, trim: true },
      caption: { type: String, trim: true, default: '' }
    }
  },
  { _id: false }
);

const embeddedQuestionSchema = new mongoose.Schema(
  {
    statement: {
      text: { type: String, trim: true, default: '' },
      images: {
        type: [
          {
            url: { type: String, trim: true },
            caption: { type: String, trim: true, default: '' }
          }
        ],
        default: []
      }
    },
    latex: { type: String, trim: true, default: '' },
    options: {
      type: [embeddedOptionSchema],
      default: []
    },
    correctAnswer: { type: String, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
    area: { type: String, trim: true, default: '' },
    competencia: { type: String, trim: true, default: '' },
    nivelCognitivo: { type: String, trim: true, default: '' },
    dificultadCualitativa: { type: String, trim: true, default: '' },
    triParams: {
      a: { type: Number, default: 1 },
      b: { type: Number, default: 0 },
      c: { type: Number, default: 0.2 }
    }
  },
  { _id: false }
);

const moduleQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null
    },
    embeddedQuestion: {
      type: embeddedQuestionSchema,
      default: null
    },
    order: {
      type: Number,
      min: 1,
      default: 1
    }
  },
  { _id: false }
);

const simulacroModuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: MODULE_NAMES,
      required: true
    },
    questions: {
      type: [moduleQuestionSchema],
      default: []
    },
    timeLimit: {
      type: Number,
      min: 5,
      max: 180,
      default: null
    }
  },
  { _id: false }
);

const simulacroSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    modules: {
      type: [simulacroModuleSchema],
      default: []
    },
    globalTimeLimit: {
      type: Number,
      min: 30,
      max: 360,
      default: null
    },
    strictMode: {
      type: Boolean,
      default: false
    },
    estado: {
      type: String,
      enum: ['borrador', 'publicado', 'cerrado'],
      default: 'borrador',
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fechaPublicacion: {
      type: Date,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

simulacroSchema.index({ institutionId: 1, createdBy: 1, estado: 1, createdAt: -1 });

simulacroSchema.pre('validate', function validateSimulacro(next) {
  if (!Array.isArray(this.modules) || this.modules.length < 1) {
    return next(new Error('Simulacro debe tener al menos un modulo'));
  }

  const nameSet = new Set();
  let totalQuestions = 0;

  for (const moduleItem of this.modules) {
    if (nameSet.has(moduleItem.name)) {
      return next(new Error('No se permiten modulos repetidos en un simulacro'));
    }

    nameSet.add(moduleItem.name);

    if (!Array.isArray(moduleItem.questions) || moduleItem.questions.length < 1) {
      return next(new Error(`El modulo ${moduleItem.name} debe tener al menos una pregunta`));
    }

    const orderSet = new Set();
    for (const questionItem of moduleItem.questions) {
      const hasRef = Boolean(questionItem.question);
      const hasEmbedded = Boolean(questionItem.embeddedQuestion);

      if (!hasRef && !hasEmbedded) {
        return next(new Error(`Cada pregunta del modulo ${moduleItem.name} debe tener question o embeddedQuestion`));
      }

      if (orderSet.has(questionItem.order)) {
        return next(new Error(`Las preguntas del modulo ${moduleItem.name} tienen order duplicado`));
      }

      orderSet.add(questionItem.order);
      totalQuestions += 1;
    }
  }

  if (totalQuestions < 1) {
    return next(new Error('Simulacro debe tener al menos una pregunta'));
  }

  return next();
});

module.exports = mongoose.model('Simulacro', simulacroSchema);
module.exports.MODULE_NAMES = MODULE_NAMES;
