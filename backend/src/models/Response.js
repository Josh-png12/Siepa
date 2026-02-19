// backend/src/models/Response.js
const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
  booklet: { type: mongoose.Schema.Types.ObjectId, ref: 'Booklet', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers: [{ questionId: mongoose.Schema.Types.ObjectId, selectedOption: Number }],
  startTime: { type: Date },
  endTime: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Response', responseSchema);