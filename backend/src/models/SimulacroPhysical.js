const mongoose = require('mongoose');

const studentPackageSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentName: { type: String, required: true, trim: true },
    studentDocument: { type: String, trim: true, default: '' },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    courseName: { type: String, trim: true, default: '' },
    qrPayload: { type: String, required: true, trim: true },
    examPdfPath: { type: String, trim: true, default: '' },
    omrPdfPath: { type: String, trim: true, default: '' }
  },
  { _id: false }
);

const simulacroPhysicalSchema = new mongoose.Schema(
  {
    simulacroPhysicalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    assignedCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true }],
    questionCount: { type: Number, required: true, min: 1, max: 147 },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true }],
    answerKey: [
      {
        question: { type: Number, required: true, min: 1 },
        correct: { type: String, required: true, enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
        competencia: { type: String, trim: true, default: '' },
        area: { type: String, trim: true, default: '' }
      }
    ],
    baseTemplatePath: { type: String, trim: true, default: '' },
    generatedBundlePath: { type: String, trim: true, default: '' },
    generatedAt: { type: Date, default: null },
    studentPackages: { type: [studentPackageSchema], default: [] },
    status: {
      type: String,
      enum: ['draft', 'generated', 'scanning', 'review', 'published', 'closed'],
      default: 'draft',
      index: true
    },
    resultPublishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
  },
  { timestamps: true }
);

simulacroPhysicalSchema.index({ createdBy: 1, createdAt: -1 });
simulacroPhysicalSchema.index({ assignedCourses: 1, status: 1 });

module.exports = mongoose.model('SimulacroPhysical', simulacroPhysicalSchema);
