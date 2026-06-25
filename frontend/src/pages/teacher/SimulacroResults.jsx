import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { getSimulacroStudentResults, aiExplainAnswer } from '../../services/api';

// ─── Conversion helpers ───────────────────────────────────────────────────────
const thetaToGlobal = (theta) =>
  Math.max(0, Math.min(500, Math.round(((Number(theta) || 0) + 3) / 6 * 500)));

const thetaToModule = (theta) =>
  Math.max(0, Math.min(100, Math.round(((Number(theta) || 0) + 3) / 6 * 100)));

const getPerformanceLevel = (score) => {
  if (score < 35) return { level: 1, label: 'Nivel 1', color: '#ef4444', light: '#fef2f2', text: 'Bajo' };
  if (score < 50) return { level: 2, label: 'Nivel 2', color: '#f97316', light: '#fff7ed', text: 'Básico' };
  if (score < 65) return { level: 3, label: 'Nivel 3', color: '#eab308', light: '#fefce8', text: 'Medio' };
  return { level: 4, label: 'Nivel 4', color: '#10b981', light: '#f0fdf4', text: 'Alto' };
};

// ─── Area color/icon map ─────────────────────────────────────────────────────
const AREA_MAP = [
  { key: 'lectura',    color: '#3b82f6', bg: '#eff6ff', icon: '📖' },
  { key: 'matemáti',  color: '#10b981', bg: '#f0fdf4', icon: '📐' },
  { key: 'matemati',  color: '#10b981', bg: '#f0fdf4', icon: '📐' },
  { key: 'ciencias',  color: '#f59e0b', bg: '#fffbeb', icon: '🔬' },
  { key: 'sociales',  color: '#7c3aed', bg: '#f5f3ff', icon: '🌍' },
  { key: 'inglés',    color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
  { key: 'ingles',    color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
  { key: 'english',   color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
];

const getAreaConfig = (name = '') => {
  const lower = name.toLowerCase();
  for (const cfg of AREA_MAP) {
    if (lower.includes(cfg.key)) return cfg;
  }
  return { color: '#6b7280', bg: '#f9fafb', icon: '📚' };
};

// ─── Level bar ───────────────────────────────────────────────────────────────
const LEVEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#10b981'];

function PerformanceLevelBar({ score }) {
  const { level, label, color, text } = getPerformanceLevel(score);
  return (
    <div className="mt-3">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((l) => (
          <div
            key={l}
            className="flex-1 h-2 rounded-full"
            style={{ backgroundColor: l <= level ? LEVEL_COLORS[l - 1] : '#e5e7eb' }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>N1</span><span>N2</span><span>N3</span><span>N4</span>
      </div>
      <p className="text-xs font-medium" style={{ color }}>
        {label} — {text}
      </p>
    </div>
  );
}

// ─── Module card ─────────────────────────────────────────────────────────────
function ModuleCard({ item }) {
  const score = thetaToModule(item.theta);
  const cfg = getAreaConfig(item.moduleName);
  const { color, light } = getPerformanceLevel(score);
  const { label: levelLabel } = getPerformanceLevel(score);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ backgroundColor: cfg.bg }}
        >
          {cfg.icon}
        </div>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full"
          style={{ backgroundColor: light, color }}
        >
          {levelLabel}
        </span>
      </div>
      <p className="text-sm font-medium text-gray-600 mb-1 leading-snug">{item.moduleName}</p>
      <p className="text-4xl font-black" style={{ color: cfg.color }}>{score}</p>
      <p className="text-xs text-gray-400 mb-1">de 100 puntos</p>
      <PerformanceLevelBar score={score} />
    </div>
  );
}

// ─── AI explanation card ─────────────────────────────────────────────────────
function AiExplanationCard({ text }) {
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">✦</span>
        <span className="text-sm font-semibold text-violet-700">Explicación IA</span>
      </div>
      <p className="text-sm text-violet-900 whitespace-pre-wrap leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function SimulacroResults() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isTeacherView = location.pathname.includes('/dashboard/docente');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(!isTeacherView);
  const [error, setError] = useState('');
  const [explanations, setExplanations] = useState({});

  useEffect(() => {
    if (isTeacherView) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getSimulacroStudentResults(id);
        setResult(response.result);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar resultados');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, isTeacherView]);

  const moduleRows = useMemo(
    () => result?.thetasByModule || result?.moduleThetas || [],
    [result],
  );

  const handleExplain = async (answer) => {
    const answerId = answer.id;
    if (!answerId || !result?.id) return;
    if (explanations[answerId]?.text) return;
    setExplanations((prev) => ({ ...prev, [answerId]: { text: null, loading: true } }));
    try {
      const data = await aiExplainAnswer({ resultId: result.id, answerId });
      setExplanations((prev) => ({ ...prev, [answerId]: { text: data.explanation, loading: false } }));
    } catch (err) {
      const msg = err.response?.data?.message || 'No se pudo generar la explicación en este momento.';
      setExplanations((prev) => ({ ...prev, [answerId]: { text: msg, loading: false } }));
    }
  };

  // ── Teacher placeholder ──
  if (isTeacherView) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Resultados del Simulacro</h1>
        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-gray-600">
            La vista detallada por estudiante se consume desde la ruta del estudiante (
            <code>/simulacros/:id/results</code>).
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Cargando resultados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl">{error}</div>
    );
  }

  if (!result) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded-xl">
        No hay resultados disponibles.
      </div>
    );
  }

  // ── Derived values ──
  const globalScore = thetaToGlobal(result.overallTheta);
  const percentile = result.percentile || 0;
  const answers = result.answers || [];
  const totalAnswers = answers.length;
  const correctAnswers = answers.filter((a) => a.isCorrect).length;
  const wrongAnswers = answers.filter((a) => a.isCorrect === false);
  const simulacroTitle =
    result.simulacro?.title || result.simulacroId?.title || 'Simulacro';

  const durationMinutes =
    result.startTime && result.endTime
      ? Math.round((new Date(result.endTime) - new Date(result.startTime)) / 60000)
      : null;

  return (
    <div className="space-y-6 pb-10">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-8 text-white"
        style={{
          background: 'linear-gradient(135deg, #0A2E57 0%, #1e4080 55%, #2563eb 100%)',
        }}
      >
        <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-2">
          ICFES Saber 11
        </p>
        <h1 className="text-3xl font-bold mb-1">Resultados del Simulacro ICFES</h1>
        <h2 className="text-xl text-blue-200 font-medium mb-4">{simulacroTitle}</h2>
        <p className="text-blue-100 text-sm max-w-2xl leading-relaxed">
          Este simulacro es una herramienta para identificar tus fortalezas y áreas de mejora.
          Usa estos resultados para focalizar tu estudio y alcanzar tu mejor puntaje.
        </p>
      </div>

      {/* ── MÉTRICAS PRINCIPALES ────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Puntaje global */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Puntaje Global
          </p>
          <div className="flex items-end gap-1">
            <span className="text-5xl font-black text-[#0A2E57] leading-none">{globalScore}</span>
            <span className="text-lg text-gray-400 pb-0.5">/500</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Escala ICFES 0–500</p>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${(globalScore / 500) * 100}%`,
                background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
              }}
            />
          </div>
        </div>

        {/* Percentil */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Percentil
          </p>
          <div className="flex items-end gap-1">
            <span className="text-5xl font-black text-[#0A2E57] leading-none">{percentile}</span>
          </div>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${Math.min(percentile, 100)}%`,
                backgroundColor: '#2563eb',
              }}
            />
          </div>
          <p className="text-xs text-blue-600 font-semibold mt-1.5">
            Superaste al {percentile}% de los estudiantes
          </p>
        </div>

        {/* Tiempo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Tiempo Empleado
          </p>
          <div className="flex items-end gap-1">
            <span className="text-5xl font-black text-[#0A2E57] leading-none">
              {durationMinutes !== null ? durationMinutes : '—'}
            </span>
            {durationMinutes !== null && (
              <span className="text-lg text-gray-400 pb-0.5">min</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">Duración total</p>
        </div>

        {/* Preguntas */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Respuestas
          </p>
          <div className="flex items-end gap-1">
            <span className="text-5xl font-black text-[#0A2E57] leading-none">
              {correctAnswers}
            </span>
            <span className="text-lg text-gray-400 pb-0.5">/{totalAnswers}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Correctas de {totalAnswers} preguntas</p>
        </div>
      </section>

      {/* ── PUNTAJE POR PRUEBA ──────────────────────────────────────────────── */}
      {moduleRows.length > 0 && (
        <section>
          <h2 className="text-lg font-bold text-[#0A2E57] mb-4">Puntaje por Prueba</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {moduleRows.map((item) => (
              <ModuleCard key={item.moduleName} item={item} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#ef4444' }} />
              Nivel 1: 0–34
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#f97316' }} />
              Nivel 2: 35–49
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#eab308' }} />
              Nivel 3: 50–64
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} />
              Nivel 4: 65–100
            </span>
          </div>
        </section>
      )}

      {/* ── DETALLE DE RESPUESTAS ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#0A2E57]">Detalle de respuestas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {correctAnswers} correctas · {wrongAnswers.length} incorrectas de {totalAnswers} preguntas
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-10">
                  #
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Pregunta
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center w-28">
                  Tu respuesta
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-center w-28">
                  Correcta
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide w-52">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {answers.map((answer, idx) => {
                const exp = explanations[answer.id];
                const questionText =
                  answer.question?.statement ||
                  answer.question?.text ||
                  answer.questionText ||
                  `Pregunta ${idx + 1}`;
                const shortText =
                  questionText.length > 85
                    ? questionText.slice(0, 85) + '…'
                    : questionText;
                const correctOption =
                  answer.correctOption ||
                  answer.question?.correctOption ||
                  answer.question?.answer;

                return (
                  <tr
                    key={answer.id || idx}
                    className="border-b border-gray-50 align-top hover:bg-gray-50 transition-colors"
                  >
                    {/* # */}
                    <td className="px-4 py-3 text-gray-400 font-medium">{idx + 1}</td>

                    {/* Enunciado */}
                    <td className="px-4 py-3 text-gray-700 max-w-xs">{shortText}</td>

                    {/* Respuesta del estudiante */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span
                          className="w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center"
                          style={{
                            backgroundColor: answer.isCorrect ? '#dcfce7' : '#fee2e2',
                            color: answer.isCorrect ? '#15803d' : '#b91c1c',
                          }}
                        >
                          {answer.selectedOption || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Respuesta correcta */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span
                          className="w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center"
                          style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
                        >
                          {correctOption || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Estado / acción */}
                    <td className="px-4 py-3">
                      {answer.isCorrect ? (
                        <span
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
                        >
                          ✓ Correcto
                        </span>
                      ) : (
                        <div>
                          <button
                            type="button"
                            onClick={() => handleExplain(answer)}
                            disabled={exp?.loading}
                            className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 font-semibold text-white transition-all disabled:opacity-60 whitespace-nowrap"
                            style={{
                              background: exp?.loading
                                ? '#9ca3af'
                                : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                            }}
                          >
                            {exp?.loading ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                Generando...
                              </>
                            ) : exp?.text ? (
                              '✦ Ver explicación'
                            ) : (
                              '🤖 ¿Por qué me equivoqué?'
                            )}
                          </button>
                          {exp?.text && <AiExplanationCard text={exp.text} />}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── HINT INCORRECTAS ────────────────────────────────────────────────── */}
      {wrongAnswers.length > 0 && (
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-5 py-4 text-sm text-violet-700">
          <span className="font-semibold">💡 Consejo:</span> Tienes{' '}
          <strong>{wrongAnswers.length}</strong> pregunta
          {wrongAnswers.length !== 1 ? 's' : ''} incorrecta
          {wrongAnswers.length !== 1 ? 's' : ''}. Haz clic en{' '}
          <strong>"🤖 ¿Por qué me equivoqué?"</strong> para obtener una explicación
          personalizada con IA.
        </div>
      )}

      {/* ── BOTONES FINALES ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={() => navigate('/dashboard/estudiante')}
          className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
        >
          ← Volver al inicio
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard/estudiante/simulacros')}
          className="px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: '#0A2E57' }}
        >
          Ver mis simulacros
        </button>
        <button
          type="button"
          onClick={() => alert('Función de compartir próximamente disponible.')}
          className="px-5 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-medium text-sm hover:bg-blue-100 transition-colors"
        >
          ↗ Compartir resultados
        </button>
      </div>
    </div>
  );
}

export default SimulacroResults;
