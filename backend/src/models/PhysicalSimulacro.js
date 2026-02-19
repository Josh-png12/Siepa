const mongoose = require('mongoose');

const answerKeySchema = new mongoose.Schema(
  {
    questionNumber: { type: Number, required: true, min: 1 },
    correctOption: { type: String, required: true, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] }
  },
  { _id: false }
);

const physicalSimulacroSchema = new mongoose.Schema(
  {
    institutionId: { type: String, default: 'default', index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }],
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'answerKeyPending', 'readyForUpload', 'processing', 'reviewing', 'published', 'archived'],
      default: 'draft',
      index: true
    },
    totalQuestions: { type: Number, required: true, min: 1, max: 147 },
    answerKey: { type: [answerKeySchema], default: [] },
    reviewDeadline: { type: Date, required: true },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

physicalSimulacroSchema.index({ institutionId: 1, teacher: 1, status: 1 });
physicalSimulacroSchema.index({ date: -1 });
physicalSimulacroSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PhysicalSimulacro', physicalSimulacroSchema);
