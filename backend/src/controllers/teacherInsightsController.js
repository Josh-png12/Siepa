const { successResponse, errorResponse } = require('../utils/response');
const teacherInsightsService = require('../services/teacherInsightsService');
const { generateTeacherCourseReportPdf } = require('../services/teacherReportPdfService');

const getDashboardInsights = async (req, res) => {
  try {
    const data = await teacherInsightsService.getDashboardInsights({
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    });
    return successResponse(res, { data });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'Error generando insights del dashboard'
    });
  }
};

const getCourseInsights = async (req, res) => {
  try {
    const data = await teacherInsightsService.getCourseInsights({
      courseId: req.params.courseId,
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    });
    return successResponse(res, { data });
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'Error generando insights del curso'
    });
  }
};

const getCourseReportPdf = async (req, res) => {
  try {
    const insights = await teacherInsightsService.getCourseInsights({
      courseId: req.params.courseId,
      teacherId: req.user.id,
      schoolId: req.user.schoolId
    });
    const pdfBuffer = generateTeacherCourseReportPdf({
      insights,
      generatedAt: new Date()
    });

    const safeCourseName = String(insights.course.name || 'curso')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte-${safeCourseName || 'curso'}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return errorResponse(res, {
      statusCode: error.status || 500,
      message: error.message || 'Error generando reporte PDF'
    });
  }
};

module.exports = {
  getDashboardInsights,
  getCourseInsights,
  getCourseReportPdf
};
