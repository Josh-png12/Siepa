const mongoose = require('mongoose');

const courseMaterialSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    filePath: {
      type: String,
      required: true,
      trim: true
    },
    fileType: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    area: {
      type: String,
      trim: true,
      default: ''
    },
    competencia: {
      type: String,
      trim: true,
      default: ''
    },
    thetaTarget: {
      type: Number,
      min: -3,
      max: 3,
      default: null
    },
    isMandatory: {
      type: Boolean,
      default: false
    },
    tags: {
      type: [String],
      default: []
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  { timestamps: true }
);

courseMaterialSchema.index({ courseId: 1, createdAt: -1 });
courseMaterialSchema.index({ courseId: 1, area: 1, competencia: 1 });

module.exports = mongoose.model('CourseMaterial', courseMaterialSchema);
