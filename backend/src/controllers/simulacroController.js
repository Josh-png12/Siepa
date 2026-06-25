const simulacroService = require('../services/simulacroService');

const handleError = (res, error) => {
  const status = error.status || 500;
  return res.status(status).json({
    success: false,
    message: error.message || 'Error interno del servidor'
  });
};

const createManualSimulacro = async (req, res) => {
  try {
    const simulacro = await simulacroService.createManualSimulacro(req.body, req.user);
    return res.status(201).json({ success: true, simulacro });
  } catch (error) {
    return handleError(res, error);
  }
};

const createSmartSimulacro = async (req, res) => {
  try {
    const simulacro = await simulacroService.createSmartSimulacro(req.body, req.user);
    return res.status(201).json({ success: true, simulacro });
  } catch (error) {
    return handleError(res, error);
  }
};

const getSimulacros = async (req, res) => {
  try {
    const result = await simulacroService.getSimulacrosByTeacher(req.query, req.user);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
};

const getSimulacroById = async (req, res) => {
  try {
    const simulacro = await simulacroService.getSimulacroById(req.params.id, req.user.id, req.user.role);
    return res.json({ success: true, simulacro });
  } catch (error) {
    return handleError(res, error);
  }
};

const updateSimulacro = async (req, res) => {
  try {
    const simulacro = await simulacroService.updateSimulacro(req.params.id, req.body, req.user);
    return res.json({ success: true, simulacro });
  } catch (error) {
    return handleError(res, error);
  }
};

const publishSimulacro = async (req, res) => {
  try {
    const simulacro = await simulacroService.publishSimulacro(req.params.id, req.user);
    return res.json({ success: true, simulacro });
  } catch (error) {
    return handleError(res, error);
  }
};

const deleteSimulacro = async (req, res) => {
  try {
    await simulacroService.deleteSimulacro(req.params.id, req.user);
    return res.json({ success: true, message: 'Simulacro eliminado correctamente' });
  } catch (error) {
    return handleError(res, error);
  }
};

const getAvailableSimulacros = async (req, res) => {
  try {
    const result = await simulacroService.getAvailableSimulacrosForStudent(req.query, req.user.schoolId);
    return res.json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
};

const startSimulacro = async (req, res) => {
  try {
    const payload = await simulacroService.startSimulacro(req.params.id, req.user.id, req.user.schoolId);
    return res.status(201).json({ success: true, ...payload });
  } catch (error) {
    return handleError(res, error);
  }
};

const submitSimulacro = async (req, res) => {
  try {
    const result = await simulacroService.submitSimulacro({
      simulacroId: req.params.id,
      studentId: req.user.id,
      schoolId: req.user.schoolId,
      answersInput: req.body.answers,
      moduleTimesInput: req.body.moduleTimes,
      markedForReviewInput: req.body.markedForReview
    });

    return res.json({ success: true, result });
  } catch (error) {
    return handleError(res, error);
  }
};

const getStudentResults = async (req, res) => {
  try {
    const result = await simulacroService.getStudentResultsForSimulacro(req.params.id, req.user.id);
    return res.json({ success: true, result });
  } catch (error) {
    return handleError(res, error);
  }
};

module.exports = {
  createManualSimulacro,
  createSmartSimulacro,
  getSimulacros,
  getSimulacroById,
  updateSimulacro,
  publishSimulacro,
  deleteSimulacro,
  getAvailableSimulacros,
  startSimulacro,
  submitSimulacro,
  getStudentResults
};
