// backend/src/models/PhysicalSheet.js
const mongoose = require('mongoose');

const physicalSheetSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },

    simulacro: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Simulacro',
      required: true,
      index: true
    },

    file: {
      originalName: {
        type: String,
        required: true
      },
      filePath: {
        type: String,
        required: true
      },
      fileSize: {
        type: Number,
        required: true
      },
      mimeType: {
        type: String,
        required: true
      }
    },

    // Respuestas detectadas automáticamente por OCR
    rawResponses: {
      type: [String],
      default: []
    },

    // Respuestas finales después de revisión manual (docente)
    confirmedResponses: {
      type: [String],
      default: []
    },

    // Confianza promedio del OCR (0 a 1)
    ocrConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },

    // Errores detectados por OCR (para revisión manual)
    ocrErrors: {
      type: [String],
      default: []
    },

    // Estado del flujo OCR
    status: {
      type: String,
      enum: [
        'uploaded',         // Subida por docente
        'processing',       // En cola de OCR
        'processed',        // OCR finalizado
        'needs_review',     // Confianza baja → requiere revisión manual
        'confirmed',        // Revisado y confirmado
        'rejected'          // Descartado
      ],
      default: 'uploaded',
      index: true
    },

    // Resultados TRI después de confirmación
    triResult: {
      theta: { type: Number, default: 0 },
      scaledScore: { type: Number, default: 0 },
      percentil: { type: Number, default: 0 }
    },

    // Auditoría
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    processedAt: Date,
    confirmedAt: Date
  },
  {
    timestamps: true
  }
);

// Índices compuestos para búsquedas rápidas
physicalSheetSchema.index({ student: 1, simulacro: 1 }, { unique: true });
physicalSheetSchema.index({ course: 1, status: 1 });
physicalSheetSchema.index({ createdBy: 1, createdAt: -1 });

// Pre-hook opcional: actualizar estado si se confirma
physicalSheetSchema.pre('save', function (next) {
  if (this.isModified('confirmedResponses') && this.confirmedResponses.length > 0) {
    this.status = 'confirmed';
    this.confirmedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('PhysicalSheet', physicalSheetSchema);