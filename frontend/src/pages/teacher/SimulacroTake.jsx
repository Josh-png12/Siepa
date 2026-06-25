import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { startSimulacroAttempt, submitSimulacroAttempt } from '../../services/api';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function flattenQuestions(modules = []) {
  const flat = [];
  modules.forEach((moduleItem) => {
    (moduleItem.questions || []).forEach((moduleQuestion) => {
      const source = moduleQuestion.question || moduleQuestion.embeddedQuestion;
      if (!source) return;

      flat.push({
        moduleName: moduleItem.name,
        questionId: moduleQuestion.question?.id || `embedded-${moduleItem.name}-${moduleQuestion.order}`,
        order: moduleQuestion.order,
        statementText: source.statementText || source.statement?.text || source.latex || '(sin texto)',
        options: source.options || []
      });
    });
  });

  return flat;
}

function SimulacroTake() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [simulacro, setSimulacro] = useState(null);
  const [attemptId, setAttemptId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState(new Set());
  const [moduleTimes, setModuleTimes] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const start = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await startSimulacroAttempt(id);
        const startedSimulacro = response.simulacro;
        const flat = flattenQuestions(startedSimulacro.modules);

        setSimulacro(startedSimulacro);
        setAttemptId(response.attemptId || '');
        setQuestions(flat);

        const initialTimes = {};
        (startedSimulacro.modules || []).forEach((moduleItem) => {
          initialTimes[moduleItem.name] = 0;
        });
        setModuleTimes(initialTimes);

        if (startedSimulacro.globalTimeLimit) {
          setTimeLeft(Number(startedSimulacro.globalTimeLimit) * 60);
        } else {
          setTimeLeft(null);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo iniciar el simulacro');
      } finally {
        setLoading(false);
      }
    };

    start();
  }, [id]);

  useEffect(() => {
    if (!simulacro || !questions.length) return undefined;

    const timer = setInterval(() => {
      setModuleTimes((prev) => {
        const current = questions[currentIndex];
        if (!current) return prev;

        return {
          ...prev,
          [current.moduleName]: Number(prev[current.moduleName] || 0) + 1
        };
      });

      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [simulacro, questions, currentIndex]);

  useEffect(() => {
    if (timeLeft === 0) {
      submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const currentQuestion = questions[currentIndex];

  const groupedByModule = useMemo(() => {
    const map = new Map();

    questions.forEach((question, index) => {
      if (!map.has(question.moduleName)) {
        map.set(question.moduleName, []);
      }
      map.get(question.moduleName).push({ ...question, globalIndex: index });
    });

    return Array.from(map.entries());
  }, [questions]);

  const setAnswer = (questionId, option) => {
    setAnswers((prev) => ({
      ...prev,
      [String(questionId)]: option
    }));
  };

  const toggleMark = (questionId) => {
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      const key = String(questionId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submit = async (auto = false) => {
    if (submitting || !simulacro) return;
    if (!auto) {
      const confirmed = window.confirm('Deseas finalizar el simulacro?');
      if (!confirmed) return;
    }

    try {
      setSubmitting(true);
      setError('');

      const payload = {
        attemptId,
        answers: Object.entries(answers)
          .filter(([questionId]) => !String(questionId).startsWith('embedded-'))
          .map(([questionId, selectedOption]) => ({ questionId, selectedOption })),
        moduleTimes: Object.entries(moduleTimes).map(([moduleName, secondsSpent]) => ({
          moduleName,
          secondsSpent
        })),
        markedForReview: Array.from(markedForReview).filter((item) => !item.startsWith('embedded-'))
      };

      await submitSimulacroAttempt(id, payload);
      navigate(`/simulacros/${id}/results`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar el simulacro');
    } finally {
      setSubmitting(false);
    }
  };

  const canJumpTo = (index) => {
    if (!simulacro?.strictMode) return true;
    return index <= currentIndex + 1;
  };

  if (loading) {
    return <div className="bg-white p-6 rounded-2xl shadow">Cargando simulacro...</div>;
  }

  if (!simulacro || !currentQuestion) {
    return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">No se pudo iniciar el simulacro.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">{simulacro.title}</h1>
          <p className="text-gray-600">Pregunta {currentIndex + 1} de {questions.length}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Tiempo restante</p>
          <p className={`text-2xl font-bold ${timeLeft !== null && timeLeft < 300 ? 'text-red-600' : 'text-[#0A2E57]'}`}>
            {timeLeft === null
              ? 'Sin limite'
              : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
          </p>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <section className="bg-white rounded-2xl shadow p-6 space-y-5">
          <div>
            <p className="text-sm text-blue-700 font-semibold">Modulo: {currentQuestion.moduleName}</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">{currentQuestion.statementText}</h2>
          </div>

          <div className="space-y-2">
            {(currentQuestion.options || []).map((option) => {
              const label = option.label;
              if (!OPTION_LABELS.includes(label)) return null;
              const selected = answers[String(currentQuestion.questionId)] === label;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setAnswer(currentQuestion.questionId, label)}
                  className={`w-full text-left border rounded-lg p-3 transition ${selected ? 'border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-semibold mr-2">{label}.</span>
                  {option.text}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
            >
              Siguiente
            </button>
            <button
              type="button"
              onClick={() => toggleMark(currentQuestion.questionId)}
              className={`px-4 py-2 rounded-lg ${markedForReview.has(String(currentQuestion.questionId)) ? 'bg-orange-100 text-orange-800' : 'bg-yellow-50 text-yellow-700'}`}
            >
              {markedForReview.has(String(currentQuestion.questionId)) ? 'Marcada' : 'Marcar para revision'}
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={submitting}
              className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-60"
            >
              {submitting ? 'Enviando...' : 'Finalizar'}
            </button>
          </div>
        </section>

        <aside className="bg-white rounded-2xl shadow p-4 space-y-4">
          {groupedByModule.map(([moduleName, items]) => (
            <div key={moduleName} className="space-y-2">
              <p className="font-semibold text-[#0A2E57]">{moduleName}</p>
              <div className="grid grid-cols-5 gap-2">
                {items.map((item) => {
                  const answered = Boolean(answers[String(item.questionId)]);
                  const marked = markedForReview.has(String(item.questionId));
                  const active = item.globalIndex === currentIndex;

                  return (
                    <button
                      key={`${moduleName}-${item.globalIndex}`}
                      type="button"
                      disabled={!canJumpTo(item.globalIndex)}
                      onClick={() => setCurrentIndex(item.globalIndex)}
                      className={`h-9 rounded text-xs border ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : marked
                            ? 'bg-orange-50 border-orange-300 text-orange-700'
                            : answered
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-white border-gray-300 text-gray-700'
                      } disabled:opacity-40`}
                    >
                      {item.globalIndex + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export default SimulacroTake;
