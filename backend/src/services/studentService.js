const Course = require('../models/Course');
const StudentProgress = require('../models/StudentProgress');

const getStudentsByCourse = async (courseId) => {
  const course = await Course.findById(courseId)
    .populate({
      path: 'students',
      select: 'name email'
    })
    .lean();

  if (!course) throw new Error('Curso no encontrado');

  const studentIds = course.students.map(s => s._id);

  const progresses = await StudentProgress.find({
    student: { $in: studentIds }
  }).lean();

  return course.students.map(student => {
    const progress = progresses.find(p =>
      p.student.toString() === student._id.toString()
    );

    return {
      ...student,
      currentTheta: progress?.currentTheta || 0,
      percentile: progress?.percentile || 0,
      globalScore: progress?.globalScore || 0
    };
  });
};

module.exports = {
  getStudentsByCourse
};