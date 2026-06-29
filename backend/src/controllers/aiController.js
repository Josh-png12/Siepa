const prisma = require('../config/prisma');
const { safeExplain, generateQuestions } = require('../services/aiExplanationService');

const explainAnswer = async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: 'Servicio de IA no configurado' });
  }

  try {
    const studentId = req.user.id;
    const { resultId, answerId } = req.body;

    if (!resultId || !answerId) {
      return res.status(400).json({ message: 'resultId y answerId son requeridos' });
    }

    // Verify the student owns this result
    const result = await prisma.simulacroResult.findFirst({
      where: { id: resultId, studentId },
      select: { id: true },
    });

    if (!result) {
      return res.status(404).json({ message: 'Resultado no encontrado' });
    }

    // Load the answer with the question snapshot
    const answer = await prisma.simulacroAnswer.findFirst({
      where: { id: answerId, resultId },
      include: {
        simulacroQuestion: {
          include: {
            question: {
              select: {
                statementText: true,
                options: true,
                correctAnswer: true,
                area: true,
                competencia: true,
              },
            },
          },
        },
      },
    });

    if (!answer) {
      return res.status(404).json({ message: 'Respuesta no encontrada' });
    }

    if (answer.isCorrect !== false) {
      return res.status(400).json({ message: 'Esta respuesta no fue incorrecta' });
    }

    // Return cached explanation
    if (answer.aiExplanation) {
      return res.json({ explanation: answer.aiExplanation, cached: true });
    }

    // Resolve question data: prefer embedded snapshot, fall back to live question
    const sq = answer.simulacroQuestion;
    const questionData = sq?.embeddedQuestion || sq?.question;

    if (!questionData) {
      return res.status(422).json({ message: 'No se encontraron datos de la pregunta para generar la explicación' });
    }

    const explanation = await safeExplain({
      question: questionData,
      studentAnswer: answer.selectedOption || '?',
      correctAnswer: questionData.correctAnswer || '?',
      area: questionData.area || 'General',
      competencia: questionData.competencia || 'General',
    });

    // Cache the explanation so DeepSeek is not called twice
    await prisma.simulacroAnswer.update({
      where: { id: answer.id },
      data: { aiExplanation: explanation },
    });

    return res.json({ explanation, cached: false });
  } catch (error) {
    console.error('[aiController.explainAnswer]', error);
    return res.status(500).json({ message: 'Error interno al generar la explicación' });
  }
};

const generateQuestionsHandler = async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: 'Servicio de IA no configurado' });
  }

  try {
    const { area, competencia, dificultad, tema, cantidad } = req.body;

    if (!area || !competencia || !dificultad) {
      return res.status(400).json({ message: 'area, competencia y dificultad son requeridos' });
    }

    const qty = Math.min(10, Math.max(1, parseInt(cantidad, 10) || 3));

    const { questions, textoBase } = await generateQuestions({ area, competencia, dificultad, tema, cantidad: qty });

    return res.json({ questions, textoBase });
  } catch (error) {
    console.error('[aiController.generateQuestionsHandler]', error);
    return res.status(500).json({ message: error.message || 'Error al generar preguntas con IA' });
  }
};

const createCaseGroupHandler = async (req, res) => {
  try {
    const { titulo, contenido } = req.body;
    if (!titulo || !contenido) {
      return res.status(400).json({ message: 'titulo y contenido son requeridos' });
    }

    const caseGroup = await prisma.caseGroup.create({
      data: {
        schoolId: req.user.schoolId,
        title: String(titulo).trim(),
        contextText: String(contenido).trim(),
        createdById: req.user.id,
      },
    });

    return res.status(201).json({ id: caseGroup.id });
  } catch (error) {
    console.error('[aiController.createCaseGroupHandler]', error);
    return res.status(500).json({ message: 'Error al crear el texto base' });
  }
};

module.exports = { explainAnswer, generateQuestionsHandler, createCaseGroupHandler };
