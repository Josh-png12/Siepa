// backend/src/models/Report.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  response: { type: mongoose.Schema.Types.ObjectId, ref: 'Response', required: true },
  score: { type: Number, required: true }, // Puntaje total
  byCompetencia: [{ // Análisis por competencia
    competencia: String,
    correct: Number,
    total: Number,
    fortalezas: [String],
    debilidades: [String],
  }],
  recomendaciones: [String], // Sugerencias pedagógicas
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);