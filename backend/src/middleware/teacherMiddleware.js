const Course = require('../models/Course');

const checkCourseOwnership = async (req, res, next) => {
  const { courseId } = req.params;
  const teacherId = req.user.id;

  try {
    const course = await Course.findOne({ _id: courseId, teacher: teacherId });
    if (!course) {
      return res.status(403).json({ message: 'No tienes permiso para acceder a este curso' });
    }
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al verificar curso' });
  }
};

module.exports = { checkCourseOwnership };