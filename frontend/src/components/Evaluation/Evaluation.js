import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { startEvaluation, submitEvaluation } from '../../services/api'; // tus funciones API

function Evaluation() {
  const { bookletId } = useParams(); // Suponiendo ruta: /evaluation/:bookletId
  const navigate = useNavigate();

  const [booklet, setBooklet] = useState(null);
  const [responseId, setResponseId] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState([]);           // { questionId, selectedOption }
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 1. Cargar el cuadernillo al montar el componente
  useEffect(() => {
    const fetchBookletAndStart = async () => {
      try {
        // Aquí  tener una llamada para obtener el booklet si no lo pasas como prop
        // Por ahora asumimos que lo obtienes de otra forma o lo pasas como prop
        // const bookletData = await getBooklet(bookletId);
        // setBooklet(bookletData);

        // Iniciar la evaluación en el backend
        const response = await startEvaluation(bookletId);
        setBooklet(response.booklet); // Suponiendo que la respuesta trae el booklet populado
        setResponseId(response.responseId);
        setTimeLeft(response.booklet.duration * 60);
      } catch (err) {
        console.error('Error al iniciar evaluación:', err);
        alert('No se pudo cargar la evaluación');
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchBookletAndStart();
  }, [bookletId, navigate]);

  // 2. Temporizador
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          clearInterval(timer);
          handleAutoSubmit(); // Auto-enviar cuando se acaba el tiempo
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]); // ← Nota: quitamos la dependencia circular que tenías

  // Función para auto-enviar al acabarse el tiempo
  const handleAutoSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submitEvaluation(responseId, answers);
      alert('Tiempo agotado. Evaluación enviada automáticamente.');
      navigate('/report/success'); // o donde muestres el reporte
    } catch (err) {
      alert('Error al enviar automáticamente');
    } finally {
      setSubmitting(false);
    }
  };

  // Manejar selección de respuesta
  const handleAnswerSelect = (questionId, selectedOption) => {
    setAnswers((prev) => {
      const existing = prev.find(a => a.questionId === questionId);
      if (existing) {
        return prev.map(a =>
          a.questionId === questionId ? { ...a, selectedOption } : a
        );
      }
      return [...prev, { questionId, selectedOption }];
    });
  };

  // Enviar manualmente
  const handleSubmit = async () => {
    if (submitting) return;
    if (!window.confirm('¿Estás seguro de enviar la evaluación?')) return;

    setSubmitting(true);
    try {
      await submitEvaluation(responseId, answers);
      alert('Evaluación enviada con éxito');
      navigate('/dashboard');
    } catch (err) {
      alert('Error al enviar la evaluación');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center p-8">Cargando evaluación...</div>;
  if (!booklet) return <div>Error: Cuadernillo no encontrado</div>;

  const currentQuestion = booklet.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Barra superior con temporizador */}
      <div className="fixed top-0 left-0 right-0 bg-white shadow-md p-4 z-10 flex justify-between items-center">
        <h2 className="text-lg font-semibold">
          Pregunta {currentQuestionIndex + 1} de {booklet.questions.length}
        </h2>
        <div className={`text-xl font-bold ${timeLeft < 300 ? 'text-red-600' : ''}`}>
          {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>
      </div>

      {/* Contenido principal */}
      <div className="mt-20 max-w-3xl mx-auto">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg mb-8">
          <p className="text-xl mb-6">{currentQuestion?.questionText}</p>

          <div className="space-y-4">
            {currentQuestion?.options.map((option, idx) => (
              <label
                key={idx}
                className="flex items-center p-4 border rounded-lg hover:bg-blue-50 cursor-pointer transition"
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion._id}`}
                  value={idx}
                  checked={answers.find(a => a.questionId === currentQuestion._id)?.selectedOption === idx}
                  onChange={() => handleAnswerSelect(currentQuestion._id, idx)}
                  className="mr-3 w-5 h-5"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Navegación entre preguntas */}
        <div className="flex justify-between mb-8">
          <button
            onClick={() => setCurrentQuestionIndex(i => Math.max(0, i - 1))}
            disabled={currentQuestionIndex === 0}
            className="px-6 py-3 bg-gray-300 rounded-lg disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            onClick={() => setCurrentQuestionIndex(i => Math.min(booklet.questions.length - 1, i + 1))}
            disabled={currentQuestionIndex === booklet.questions.length - 1}
            className="px-6 py-3 bg-gray-300 rounded-lg disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>

        {/* Botón Enviar */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-lg text-lg font-semibold disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Finalizar y Enviar Evaluación'}
        </button>
      </div>
    </div>
  );
}

export default Evaluation;