const mongoose = require('mongoose');
const StudentProgress = require('./StudentProgress');

const courseSchema = new mongoose.Schema({
  institutionId: { type: String, default: 'default', index: true },
  name: { type: String, required: true, index: true },
  grade: { type: String, required: true },
  year: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
  averageTheta: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  deletedAt: { type: Date, default: null, index: true },
  createdAt: { type: Date, default: Date.now }
});

courseSchema.pre('save', async function preSave(next) {
  const progresses = await StudentProgress.find({ student: { $in: this.students } })
    .select('currentTheta')
    .lean();
  this.averageTheta = progresses.length
    ? progresses.reduce((sum, item) => sum + Number(item.currentTheta || 0), 0) / progresses.length
    : 0;
  next();
});

courseSchema.index({ institutionId: 1, teacher: 1, name: 1 }, { unique: true });
courseSchema.index({ institutionId: 1, status: 1, grade: 1 });

module.exports = mongoose.model('Course', courseSchema);
