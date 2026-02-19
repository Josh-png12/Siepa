const courseService = require('../services/courseManagementService');

const handleError = (res, error) => {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || 'Error interno del servidor'
  });
};

const createCourseMaterial = async (req, res) => {
  try {
    const material = await courseService.createCourseMaterial({
      courseId: req.params.courseId,
      payload: req.body,
      file: req.file,
      user: req.user
    });

    return res.status(201).json({ success: true, material });
  } catch (error) {
    return handleError(res, error);
  }
};

const getCourseMaterials = async (req, res) => {
  try {
    const materials = await courseService.getCourseMaterials({
      courseId: req.params.courseId,
      user: req.user,
      query: req.query
    });

    return res.json({ success: true, materials });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateCourseMaterial = async (req, res) => {
  try {
    const material = await courseService.updateCourseMaterial({
      courseId: req.params.courseId,
      materialId: req.params.materialId,
      payload: req.body,
      file: req.file,
      user: req.user
    });

    return res.json({ success: true, material });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteCourseMaterial = async (req, res) => {
  try {
    await courseService.deleteCourseMaterial({
      courseId: req.params.courseId,
      materialId: req.params.materialId,
      user: req.user
    });

    return res.json({ success: true, message: 'Material eliminado correctamente' });
  } catch (error) {
    return handleError(res, error);
  }
};

const logMaterialAccess = async (req, res) => {
  try {
    const access = await courseService.logMaterialAccess({
      courseId: req.params.courseId,
      materialId: req.params.materialId,
      studentId: req.user.id,
      payload: req.body
    });

    return res.status(201).json({ success: true, access });
  } catch (error) {
    return handleError(res, error);
  }
};

const openCourseMaterial = async (req, res) => {
  try {
    const material = await courseService.getMaterialOpenPayload({
      courseId: req.params.courseId,
      materialId: req.params.materialId,
      studentId: req.user.id
    });

    return res.json({ success: true, material });
  } catch (error) {
    return handleError(res, error);
  }
};

const getCourseDashboard = async (req, res) => {
  try {
    const dashboard = await courseService.getCourseDashboard({
      courseId: req.params.courseId,
      user: req.user
    });

    return res.json({ success: true, dashboard });
  } catch (error) {
    return handleError(res, error);
  }
};

const getCourseStudents = async (req, res) => {
  try {
    const students = await courseService.getCourseStudentsStats({
      courseId: req.params.courseId,
      user: req.user
    });

    return res.json({ success: true, students });
  } catch (error) {
    return handleError(res, error);
  }
};

const getCourseStudentDetail = async (req, res) => {
  try {
    const detail = await courseService.getCourseStudentDetail({
      courseId: req.params.courseId,
      studentId: req.params.studentId,
      user: req.user
    });

    return res.json({ success: true, ...detail });
  } catch (error) {
    return handleError(res, error);
  }
};

module.exports = {
  createCourseMaterial,
  getCourseMaterials,
  updateCourseMaterial,
  deleteCourseMaterial,
  logMaterialAccess,
  openCourseMaterial,
  getCourseDashboard,
  getCourseStudents,
  getCourseStudentDetail
};
