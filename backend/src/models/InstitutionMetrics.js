const mongoose = require('mongoose');

const institutionMetricsSchema = new mongoose.Schema(
  {
    institutionId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    metrics: {
      thetaDistribution: { type: [Number], default: [] },
      competencyBreakdown: {
        type: [
          {
            competencia: String,
            avgTheta: Number,
            sampleSize: Number
          }
        ],
        default: []
      },
      riskCognitiveIndex: { type: Number, default: 0 },
      crossCourseComparison: {
        type: [
          {
            courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
            avgTheta: Number,
            riskStudents: Number
          }
        ],
        default: []
      },
      teacherPerformance: {
        type: [
          {
            teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            avgTheta: Number,
            atRiskStudents: Number
          }
        ],
        default: []
      }
    }
  },
  { timestamps: true }
);

institutionMetricsSchema.index({ institutionId: 1, date: -1 }, { unique: true });

module.exports = mongoose.model('InstitutionMetrics', institutionMetricsSchema);
