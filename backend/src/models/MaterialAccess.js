const mongoose = require('mongoose');

const materialAccessSchema = new mongoose.Schema(
  {
    materialId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CourseMaterial',
      required: true,
      index: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    openedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    downloaded: {
      type: Boolean,
      default: false,
      index: true
    },
    timeSpent: {
      type: Number,
      min: 0,
      default: 0
    }
  },
  { timestamps: true }
);

materialAccessSchema.index({ materialId: 1, studentId: 1, openedAt: -1 });

module.exports = mongoose.model('MaterialAccess', materialAccessSchema);
