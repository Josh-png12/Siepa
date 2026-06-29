const mongoose = require('mongoose');

const bookletSchema = new mongoose.Schema({
  title: { type: String, required: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  duration: { type: Number, default: 60 }, // Minutos
}, { timestamps: true });

module.exports = mongoose.model('Booklet', bookletSchema);