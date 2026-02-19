// backend/src/models/StudentProgress.js
const mongoose = require('mongoose');

const studentProgressSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // Habilidad global TRI
    currentTheta: {
      type: Number,
      default: 0,
      index: true
    },

    // Puntaje escalado oficial (0-500)
    globalScore: {
      type: Number,
      default: 0
    },

    // Percentil estimado nacional
    percentile: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },

    // Competencias por área
    competencies: [
      {
        area: {
          type: String,
          enum: ['lectura', 'matematicas', 'sociales', 'ciencias', 'ingles'],
          required: true
        },
        theta: { type: Number, default: 0 },
        questionsAnswered: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
      }
    ],

    // Estadísticas generales
    simulacrosCompletados: { type: Number, default: 0 },
    rachaActual: { type: Number, default: 0 },
    ultimoSimulacro: Date,

    // Historial de evolución
    historialTheta: [
      {
        date: Date,
        theta: Number,
        globalScore: Number
      }
    ],

    // Alertas inteligentes del sistema
    alertas: [
      {
        tipo: {
          type: String,
          enum: ['bajo_rendimiento', 'inactividad', 'mejora_significativa', 'riesgo_academico']
        },
        mensaje: String,
        fecha: { type: Date, default: Date.now },
        leida: { type: Boolean, default: false }
      }
    ]
  },
  {
    timestamps: true
  }
);

// ==================== ÍNDICES PARA RENDIMIENTO ====================
studentProgressSchema.index({ student: 1 });
studentProgressSchema.index({ currentTheta: -1 });
studentProgressSchema.index({ 'competencies.area': 1, 'competencies.theta': -1 });
studentProgressSchema.index({ simulacrosCompletados: -1 });

// Virtual para calcular nivel aproximado
studentProgressSchema.virtual('nivelAproximado').get(function () {
  if (this.currentTheta >= 1.8) return 4;
  if (this.currentTheta >= 1.2) return 3;
  if (this.currentTheta >= 0.5) return 2;
  return 1;
});

module.exports = mongoose.model('StudentProgress', studentProgressSchema);