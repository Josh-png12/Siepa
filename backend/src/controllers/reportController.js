const asyncHandler = require('express-async-handler');
const Report = require('../models/Report');

const getReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id).populate('response');
  if (report.response.student.toString() !== req.user.id && req.user.role !== 'docente') {
    return res.status(403).json({ message: 'Access denied' });
  }
  res.json(report);
});

module.exports = { getReport };