import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { startEvaluation, submitEvaluation } from '../services/api';
import DigitalAnswerSheet from '../components/DigitalAnswerSheet.jsx';

function Evaluation() {
  const { bookletId } = useParams();
  const navigate = useNavigate();

  const [booklet, setBooklet] = useState(null);
  const [responseId, setResponseId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState({});                    // {1: "A", 5: "C", ...}
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef(null);

  // 1. Iniciar evaluación
  useEffect(() => {
    const init = async () => {
      try {
        const res = await startEvaluation(bookletId);
        setBooklet(res.booklet);
        setResponseId(res._id);
        setTimeLeft(res.booklet.duration * 60);
      } catch (err) {
        alert('No se pudo iniciar el simulacro');
        navigate('/dashboard/estudiante');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [bookletId, navigate]);

  // 2. Temporizador
  useEffect(() => {
    if (timeLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [timeLeft]);

  const selectAnswer = (questionNumber, option) => {
    setAnswers(prev => ({ ...prev, [questionNumber]: option }));
  };

  const toggleReview = (questionNumber) => {
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionNumber)) newSet.delete(questionNumber);
      else newSet.add(questionNumber);
      return newSet;
    });
  };

  const handleAutoSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitEvaluation(responseId, answers);
      navigate(`/results/${responseId}`);
    } catch (err) {
      alert('Error al enviar automáticamente');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    if (submitting) return;
    if (!window.confirm('¿Estás seguro de finalizar el simulacro ahora?')) return;

    setSubmitting(true);
    try {
      await submitEvaluation(responseId, answers);
      navigate(`/results/${responseId}`);
    } catch (err) {
      alert('Error al enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-xl">Cargando simulacro...</div>;
  if (!booklet) return <div>Error al cargar el simulacro</div>;

  const currentQuestion = booklet.questions[currentIndex];
  const questionNumber = currentIndex + 1;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm py-4 px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="text-[#002855] font-bold text-3xl">SIEPA</div>
          <div>
            <div className="font-semibold">Simulacro {booklet.title}</div>
            <div className="text-xs text-gray-500">Pregunta {questionNumber} de {booklet.questions.length}</div>
          </div>
        </div>

        <div className={`text-4xl font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-gray-800'}`}>
          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>

        <button
          onClick={handleManualSubmit}
          className="bg-red-600 text-white px-10 py-3 rounded-2xl font-semibold hover:bg-red-700"
        >
          Finalizar Simulacro
        </button>
      </div>

      <div className="flex max-w-screen-2xl mx-auto">
        {/* Área de la pregunta */}
        <div className="flex-1 p-10">
          <div className="bg-white rounded-3xl shadow p-12 min-h-[520px]">
            <div className="flex items-start gap-8">
              <div className="w-16 h-16 bg-[#002855] text-white rounded-2xl flex items-center justify-center text-4xl font-bold flex-shrink-0">
                {questionNumber}
              </div>
              <p className="text-2xl leading-relaxed font-medium text-gray-800">
                {currentQuestion.questionText}
              </p>
            </div>

            <div className="mt-12 space-y-5">
              {currentQuestion.options.map((option, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = answers[questionNumber] === letter;

                return (
                  <div
                    key={idx}
                    onClick={() => selectAnswer(questionNumber, letter)}
                    className={`flex gap-5 items-start p-6 border-2 rounded-2xl cursor-pointer transition-all hover:bg-blue-50
                      ${isSelected ? 'border-[#002855] bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className={`w-11 h-11 rounded-2xl border-2 flex items-center justify-center text-2xl font-bold
                      ${isSelected ? 'bg-[#002855] text-white border-[#002855]' : 'border-gray-400'}`}>
                      {letter}
                    </div>
                    <p className="text-lg pt-2">{option}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Botones de navegación */}
          <div className="flex justify-between mt-10">
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="px-10 py-4 bg-gray-200 rounded-2xl font-medium disabled:opacity-50"
            >
              ← Anterior
            </button>

            <button
              onClick={() => toggleReview(questionNumber)}
              className={`px-10 py-4 rounded-2xl font-medium border-2 ${markedForReview.has(questionNumber) ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}
            >
              {markedForReview.has(questionNumber) ? '✓ Marcar para revisar' : 'Marcar para revisar'}
            </button>

            <button
              onClick={() => setCurrentIndex(i => Math.min(booklet.questions.length - 1, i + 1))}
              disabled={currentIndex === booklet.questions.length - 1}
              className="px-10 py-4 bg-gray-200 rounded-2xl font-medium disabled:opacity-50"
            >
              Siguiente →
            </button>
          </div>
        </div>

        {/* Hoja de respuestas digital estilo ICFES */}
        <div className="w-[420px] border-l bg-white p-6 overflow-auto">
          <DigitalAnswerSheet
            totalQuestions={booklet.questions.length}
            selectedAnswers={answers}
            onAnswerSelect={selectAnswer}
          />
        </div>
      </div>
    </div>
  );
}

export default Evaluation;