const mongoose = require('mongoose');

const questionVersionSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true
    },
    versionNumber: { type: Number, required: true, min: 1 },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    changeType: {
      type: String,
      enum: ['create', 'update', 'publish', 'restore', 'import'],
      default: 'update'
    },
    changeReason: { type: String, trim: true, default: '' },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

questionVersionSchema.index({ question: 1, versionNumber: -1 });

module.exports = mongoose.model('QuestionVersion', questionVersionSchema);
