import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { startSimulacroAttempt, submitSimulacroAttempt } from '../../services/api';
import { studentTokens } from '../student/studentTokens.js';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const PRIMARY = studentTokens.colors.primary;
const PRIMARY_TINT = 'rgba(30, 58, 95, 0.06)';
const EMERALD = studentTokens.colors.emerald;
const AMBER = studentTokens.colors.amber;

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
        statementImages: source.statementImages || source.statement?.images || [],
        options: source.options || [],
        caseGroup: source.caseGroup || null
      });
    });
  });

  return flat;
}

function ImageLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-4 right-4 text-white text-3xl leading-none hover:text-slate-300"
      >
        ×
      </button>
    </div>
  );
}

function CaseGroupContext({ caseGroup, onZoom }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Texto de referencia</p>
      {caseGroup.title ? (
        <p className="font-semibold text-slate-800 text-sm">{caseGroup.title}</p>
      ) : null}
      {caseGroup.contextText ? (
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{caseGroup.contextText}</p>
      ) : null}
      {Array.isArray(caseGroup.contextImages) && caseGroup.contextImages.length > 0 ? (
        <div className="space-y-2">
          {caseGroup.contextImages.map((img, idx) => (
            <img
              key={`${img.url}-${idx}`}
              src={img.url}
              alt={img.caption || ''}
              onClick={() => onZoom(img.url)}
              className="w-full rounded border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
            />
          ))}
        </div>
      ) : null}
      {caseGroup.source ? (
        <p
          className="text-right italic mt-4 pt-3 border-t border-gray-200"
          style={{ fontSize: '12px', color: '#6B7280' }}
        >
          {caseGroup.source}
        </p>
      ) : null}
    </div>
  );
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
  const [zoomImage, setZoomImage] = useState(null);
  const [mobileContextOpen, setMobileContextOpen] = useState(false);

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

  useEffect(() => {
    setMobileContextOpen(false);
  }, [currentIndex]);

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
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Cargando simulacro...</div>;
  }

  if (!simulacro || !currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">No se pudo iniciar el simulacro.</div>
      </div>
    );
  }

  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
  const isAnswered = Boolean(answers[String(currentQuestion.questionId)]);
  const isMarked = markedForReview.has(String(currentQuestion.questionId));
  const isLast = currentIndex === questions.length - 1;
  const hasImageOptions = currentQuestion.options.length > 0
    && currentQuestion.options.every((o) => o.image?.url);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ImageLightbox src={zoomImage} onClose={() => setZoomImage(null)} />

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Área</p>
            <h1 className="text-base sm:text-lg font-bold truncate" style={{ color: PRIMARY }}>
              {currentQuestion.moduleName}
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {timeLeft !== null ? (
              <div className="text-right">
                <p className={`font-mono font-bold text-base sm:text-lg ${timeLeft < 300 ? 'text-red-600' : 'text-slate-700'}`}>
                  {`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`}
                </p>
                <p className="text-[11px] text-slate-400">Tiempo restante</p>
              </div>
            ) : null}
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">
                Pregunta {currentIndex + 1} de {questions.length}
              </p>
            </div>
          </div>
        </div>
        <div className="h-1 bg-slate-100">
          <div
            className="h-1 transition-all duration-200"
            style={{ width: `${progressPct}%`, backgroundColor: PRIMARY }}
          />
        </div>
      </header>

      {error ? (
        <div className="mx-4 sm:mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      ) : null}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div
          className={`mx-auto max-w-6xl grid gap-5 ${
            currentQuestion.caseGroup ? 'lg:grid-cols-[320px_1fr_280px]' : 'lg:grid-cols-[1fr_280px]'
          }`}
        >
          {/* Contexto compartido (CaseGroup) */}
          {currentQuestion.caseGroup ? (
            <>
              {/* Mobile: collapsible */}
              <div className="lg:hidden bg-white border border-slate-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMobileContextOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  <span>📄 Texto de referencia</span>
                  <span className="text-slate-400">{mobileContextOpen ? '−' : '+'}</span>
                </button>
                {mobileContextOpen ? (
                  <div className="px-4 pb-4 max-h-72 overflow-y-auto">
                    <CaseGroupContext caseGroup={currentQuestion.caseGroup} onZoom={setZoomImage} />
                  </div>
                ) : null}
              </div>

              {/* Desktop: sticky sidebar */}
              <div className="hidden lg:block lg:sticky lg:top-24 self-start max-h-[calc(100vh-8rem)] overflow-y-auto bg-white border border-slate-200 rounded-lg p-5">
                <CaseGroupContext caseGroup={currentQuestion.caseGroup} onZoom={setZoomImage} />
              </div>
            </>
          ) : null}

          {/* Pregunta */}
          <section className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
            <div>
              <h2
                className="text-[17px] sm:text-[18px] text-slate-800 text-left"
                style={{ lineHeight: '1.6' }}
              >
                {currentQuestion.statementText}
              </h2>

              {currentQuestion.statementImages.length > 0 ? (
                <div className="flex flex-wrap gap-3 mt-4">
                  {currentQuestion.statementImages.map((img, idx) => (
                    <img
                      key={`${img.url}-${idx}`}
                      src={img.url}
                      alt={img.caption || ''}
                      onClick={() => setZoomImage(img.url)}
                      className="max-w-xs sm:max-w-sm rounded border border-slate-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {hasImageOptions ? (
              <div className="grid grid-cols-2 gap-3">
                {currentQuestion.options.map((option) => {
                  const label = option.label;
                  if (!OPTION_LABELS.includes(label)) return null;
                  const selected = answers[String(currentQuestion.questionId)] === label;

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAnswer(currentQuestion.questionId, label)}
                      className="relative border-2 rounded-lg overflow-hidden transition-all duration-200 hover:border-slate-400"
                      style={{ borderColor: selected ? PRIMARY : '#e2e8f0' }}
                    >
                      <span
                        className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm"
                        style={selected
                          ? { backgroundColor: PRIMARY, color: '#fff' }
                          : { backgroundColor: 'rgba(255,255,255,0.9)', color: '#475569' }}
                      >
                        {label}
                      </span>
                      <img src={option.image.url} alt={`Opción ${label}`} className="w-full h-36 sm:h-44 object-cover" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {(currentQuestion.options || []).map((option) => {
                  const label = option.label;
                  if (!OPTION_LABELS.includes(label)) return null;
                  const selected = answers[String(currentQuestion.questionId)] === label;

                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAnswer(currentQuestion.questionId, label)}
                      className="w-full flex items-start gap-3 text-left border rounded-lg p-4 transition-all duration-200 hover:border-slate-400 hover:bg-slate-50"
                      style={{
                        borderColor: selected ? PRIMARY : '#e2e8f0',
                        backgroundColor: selected ? PRIMARY_TINT : '#fff'
                      }}
                    >
                      <span
                        className="flex items-center justify-center w-8 h-8 rounded-full border-2 font-bold text-sm shrink-0 transition-colors duration-200"
                        style={selected
                          ? { backgroundColor: PRIMARY, borderColor: PRIMARY, color: '#fff' }
                          : { borderColor: '#cbd5e1', color: '#64748b' }}
                      >
                        {label}
                      </span>
                      <span className="pt-1 text-[15px] leading-relaxed text-slate-800">{option.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Hoja de navegación */}
          <aside className="bg-white rounded-lg border border-slate-200 p-4 space-y-4 h-fit">
            {groupedByModule.map(([moduleName, items]) => (
              <div key={moduleName} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{moduleName}</p>
                <div className="grid grid-cols-5 gap-2">
                  {items.map((item) => {
                    const answered = Boolean(answers[String(item.questionId)]);
                    const marked = markedForReview.has(String(item.questionId));
                    const active = item.globalIndex === currentIndex;

                    let style = { borderColor: '#e2e8f0', color: '#475569', backgroundColor: '#fff' };
                    if (active) style = { backgroundColor: PRIMARY, borderColor: PRIMARY, color: '#fff' };
                    else if (marked) style = { backgroundColor: '#fffbeb', borderColor: AMBER, color: '#92400e' };
                    else if (answered) style = { backgroundColor: '#f0fdf4', borderColor: EMERALD, color: '#065f46' };

                    return (
                      <button
                        key={`${moduleName}-${item.globalIndex}`}
                        type="button"
                        disabled={!canJumpTo(item.globalIndex)}
                        onClick={() => setCurrentIndex(item.globalIndex)}
                        className="h-9 rounded text-xs font-medium border transition-colors duration-150 disabled:opacity-40"
                        style={style}
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

      {/* Footer sticky de navegación */}
      <footer className="sticky bottom-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 transition-colors duration-150"
          >
            ← Anterior
          </button>
          <button
            type="button"
            onClick={() => toggleMark(currentQuestion.questionId)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
            style={isMarked ? { backgroundColor: '#fffbeb', color: '#92400e' } : { backgroundColor: '#f8fafc', color: '#64748b' }}
          >
            {isMarked ? '★ Marcada' : '☆ Marcar para revisión'}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors duration-150 disabled:opacity-60"
            >
              Finalizar simulacro
            </button>
            {!isLast ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors duration-150"
                style={{ backgroundColor: PRIMARY, opacity: isAnswered ? 1 : 0.5 }}
              >
                Siguiente →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors duration-150 disabled:opacity-60"
                style={{ backgroundColor: EMERALD }}
              >
                {submitting ? 'Enviando...' : 'Finalizar'}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default SimulacroTake;
