const Evaluation = require('../models/Evaluation');
const Booklet = require('../models/Booklet');
const { estimateTheta } = require('../services/triService');

// ==================== INICIAR EVALUACIÓN ====================
exports.startEvaluation = async (req, res) => {
  try {
    const { bookletId } = req.params;
    const studentId = req.user.id;

    // Verificar que el cuadernillo exista
    const booklet = await Booklet.findById(bookletId).populate('questions');
    if (!booklet) {
      return res.status(404).json({ message: 'Cuadernillo no encontrado' });
    }

    // Evitar que el estudiante tenga 2 simulacros activos del mismo cuadernillo
    const existingActive = await Evaluation.findOne({
      student: studentId,
      booklet: bookletId,
      status: 'in-progress'
    });

    if (existingActive) {
      return res.json({
        message: 'Ya tienes un simulacro en progreso de este cuadernillo',
        evaluation: existingActive
      });
    }

    // Crear nueva evaluación
    const evaluation = await Evaluation.create({
      student: studentId,
      booklet: bookletId,
      responses: [],
      status: 'in-progress',
      startedAt: Date.now()
    });

    res.status(201).json({
      success: true,
      evaluationId: evaluation._id,
      booklet: booklet
    });

  } catch (error) {
    console.error('Error en startEvaluation:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// ==================== ENVIAR EVALUACIÓN + CALCULAR TRI ====================
exports.submitEvaluation = async (req, res) => {
  try {
    const { evaluationId } = req.params;
    const { answers } = req.body; // Formato esperado: { "1": "A", "5": "C", ... }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ message: 'Respuestas inválidas' });
    }

    // Buscar evaluación y popular el cuadernillo con sus preguntas
    const evaluation = await Evaluation.findById(evaluationId).populate({
      path: 'booklet',
      populate: { path: 'questions' }
    });

    if (!evaluation) {
      return res.status(404).json({ message: 'Evaluación no encontrada' });
    }

    // Verificar que el estudiante sea el dueño
    if (evaluation.student.toString() !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permiso para enviar esta evaluación' });
    }

    // Convertir el objeto {1: "A", 2: "B"} → array de respuestas
    const responsesArray = Object.entries(answers).map(([questionNumber, selectedOption]) => {
      const index = parseInt(questionNumber) - 1;
      const question = evaluation.booklet.questions[index];

      return {
        questionId: question._id,
        selectedOption: selectedOption
      };
    });

    // Guardar respuestas
    evaluation.responses = responsesArray;
    evaluation.status = 'completed';
    evaluation.completedAt = Date.now();

    // Calcular θ usando TRI (3PL)
    const thetaItems = evaluation.booklet.questions.map((question) => ({
      _id: question._id,
      a: Number(question.triParams?.a ?? 1),
      b: Number(question.triParams?.b ?? 0),
      c: Number(question.triParams?.c ?? 0.2),
      correctAnswer: question.correctAnswer
    }));
    const theta = estimateTheta(responsesArray, thetaItems, 0);

    evaluation.theta = theta;
    evaluation.globalScore = Math.round(250 + theta * 85); // Escala aproximada 0-500

    await evaluation.save();

    res.json({
      success: true,
      evaluationId: evaluation._id,
      theta: theta,
      globalScore: evaluation.globalScore,
      message: 'Evaluación enviada correctamente'
    });

  } catch (error) {
    console.error('Error en submitEvaluation:', error);
    res.status(500).json({ message: 'Error al procesar la evaluación' });
  }
};

// ==================== RESULTADO DETALLADO (VIRTUAL/FISICO) ====================
exports.getEvaluationResult = async (req, res) => {
  try {
    const { evaluationId } = req.params;

    const evaluation = await Evaluation.findById(evaluationId)
      .populate({
        path: 'booklet',
        populate: { path: 'questions', select: 'statement latex options correctAnswer competencia area' }
      })
      .populate('physicalSimulacro', 'simulacroPhysicalId title status resultPublishedAt')
      .populate('responses.questionId', 'statement latex options correctAnswer competencia area');

    if (!evaluation) {
      return res.status(404).json({ success: false, message: 'Evaluacion no encontrada' });
    }

    if (evaluation.student.toString() !== req.user.id && req.user.role !== 'docente' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    if (evaluation.evaluationType === 'physical') {
      if (evaluation.physicalSimulacro?.status !== 'published' && req.user.role === 'estudiante') {
        return res.status(403).json({ success: false, message: 'Resultados fisicos aun no publicados' });
      }

      return res.json({
        success: true,
        result: {
          evaluationId: evaluation._id,
          type: 'physical',
          theta: evaluation.theta,
          globalScore: evaluation.globalScore,
          percentile: evaluation.percentile,
          status: evaluation.status,
          simulacroPhysical: evaluation.physicalSimulacro,
          competencyBreakdown: evaluation.physicalMeta?.competencyBreakdown || [],
          scannedSheetPath: evaluation.physicalMeta?.scannedSheetPath || '',
          responses: evaluation.responses || [],
          suggestions: (evaluation.physicalMeta?.competencyBreakdown || [])
            .map((row) => {
              const ratio = row.total ? row.correct / row.total : 0;
              if (ratio >= 0.7) return null;
              return `Refuerza ${row.competencia}: ${row.correct}/${row.total} correctas`;
            })
            .filter(Boolean)
        }
      });
    }

    return res.json({
      success: true,
      result: {
        evaluationId: evaluation._id,
        type: 'virtual',
        theta: evaluation.theta,
        globalScore: evaluation.globalScore,
        status: evaluation.status,
        responses: evaluation.responses || [],
        booklet: evaluation.booklet
      }
    });
  } catch (error) {
    console.error('Error getEvaluationResult:', error);
    return res.status(500).json({ success: false, message: 'Error al obtener resultado de evaluacion' });
  }
};

// ==================== EXPORT ====================
module.exports = {
  startEvaluation: exports.startEvaluation,
  submitEvaluation: exports.submitEvaluation,
  getEvaluationResult: exports.getEvaluationResult
};
