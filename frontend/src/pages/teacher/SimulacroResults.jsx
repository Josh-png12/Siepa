import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { getSimulacroStudentResults, aiExplainAnswer } from '../../services/api';
import { studentTokens } from '../student/studentTokens.js';

const PRIMARY = studentTokens.colors.primary;
const EMERALD = studentTokens.colors.emerald;
const AMBER = studentTokens.colors.amber;
const ACCENT = studentTokens.colors.accent;

// ─── Conversion helpers ───────────────────────────────────────────────────────
const thetaToGlobal = (theta) =>
  Math.max(0, Math.min(500, Math.round(((Number(theta) || 0) + 3) / 6 * 500)));

const thetaToModule = (theta) =>
  Math.max(0, Math.min(100, Math.round(((Number(theta) || 0) + 3) / 6 * 100)));

// Mirrors backend simulacroService.toPercentile — same normal-CDF approximation,
// so numbers shown here are methodologically consistent with the stored percentile.
const erfApprox = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-absX * absX);
  return sign * y;
};

const toPercentile = (theta) => {
  const cdf = 0.5 * (1 + erfApprox(Number(theta) / Math.sqrt(2)));
  return Math.max(1, Math.min(99, Math.round(cdf * 100)));
};

const LEVEL_COLORS = ['#ef4444', '#f97316', AMBER, EMERALD];

const getPerformanceLevel = (score) => {
  if (score < 35) return { level: 1, label: 'Nivel 1', color: LEVEL_COLORS[0], light: '#fef2f2', text: 'Bajo' };
  if (score < 50) return { level: 2, label: 'Nivel 2', color: LEVEL_COLORS[1], light: '#fff7ed', text: 'Básico' };
  if (score < 65) return { level: 3, label: 'Nivel 3', color: LEVEL_COLORS[2], light: '#fffbeb', text: 'Medio' };
  return { level: 4, label: 'Nivel 4', color: LEVEL_COLORS[3], light: '#f0fdf4', text: 'Alto' };
};

// ─── Area color/icon map ─────────────────────────────────────────────────────
const AREA_MAP = [
  { key: 'lectura',    areaKey: 'lectura',     color: '#3b82f6', bg: '#eff6ff', icon: '📖' },
  { key: 'matemáti',   areaKey: 'matematicas', color: EMERALD,   bg: '#f0fdf4', icon: '📐' },
  { key: 'matemati',   areaKey: 'matematicas', color: EMERALD,   bg: '#f0fdf4', icon: '📐' },
  { key: 'ciencias',   areaKey: 'ciencias',    color: AMBER,     bg: '#fffbeb', icon: '🔬' },
  { key: 'sociales',   areaKey: 'sociales',    color: studentTokens.colors.violet, bg: '#f5f3ff', icon: '🌍' },
  { key: 'inglés',     areaKey: 'ingles',      color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
  { key: 'ingles',     areaKey: 'ingles',      color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
  { key: 'english',    areaKey: 'ingles',      color: '#ef4444', bg: '#fef2f2', icon: '🌐' },
];

const getAreaConfig = (name = '') => {
  const lower = name.toLowerCase();
  for (const cfg of AREA_MAP) {
    if (lower.includes(cfg.key)) return cfg;
  }
  return { areaKey: 'otro', color: '#6b7280', bg: '#f9fafb', icon: '📚' };
};

// ─── Nivel de desempeño — descripciones de habilidades ───────────────────────
// Verificado solo para Lectura Crítica nivel 4 (texto público ICFES provisto).
// El resto queda con placeholder hasta validar contra la Guía de interpretación
// y uso de resultados Saber 11 (ICFES) vigente — no se fabrica texto atribuido
// a ICFES sin poder confirmarlo.
const PLACEHOLDER_SKILLS = ['Descripción pendiente de validar con la guía oficial del ICFES.'];

const LEVEL_SKILLS = {
  lectura: {
    4: [
      'Propone soluciones a problemas de interpretación que subyacen en un texto.',
      'Evalúa contenidos, estrategias discursivas y argumentativas presentes en un texto.'
    ],
    3: PLACEHOLDER_SKILLS, // TODO: verificar nivel 3 de Lectura Crítica contra la guía oficial ICFES
    2: PLACEHOLDER_SKILLS, // TODO: verificar nivel 2 de Lectura Crítica contra la guía oficial ICFES
    1: PLACEHOLDER_SKILLS  // TODO: verificar nivel 1 de Lectura Crítica contra la guía oficial ICFES
  },
  // TODO: verificar los 4 niveles de Matemáticas contra la guía oficial ICFES
  matematicas: { 4: PLACEHOLDER_SKILLS, 3: PLACEHOLDER_SKILLS, 2: PLACEHOLDER_SKILLS, 1: PLACEHOLDER_SKILLS },
  // TODO: verificar los 4 niveles de Ciencias Naturales contra la guía oficial ICFES
  ciencias: { 4: PLACEHOLDER_SKILLS, 3: PLACEHOLDER_SKILLS, 2: PLACEHOLDER_SKILLS, 1: PLACEHOLDER_SKILLS },
  // TODO: verificar los 4 niveles de Sociales y Ciudadanas contra la guía oficial ICFES
  sociales: { 4: PLACEHOLDER_SKILLS, 3: PLACEHOLDER_SKILLS, 2: PLACEHOLDER_SKILLS, 1: PLACEHOLDER_SKILLS },
  // TODO: ICFES reporta Inglés en niveles CEFR (A-, A1, A2, B1, B+), no en escala 1-4.
  // Mientras no calibremos ese mapeo, se mantiene la escala interna 1-4 del simulacro.
  ingles: { 4: PLACEHOLDER_SKILLS, 3: PLACEHOLDER_SKILLS, 2: PLACEHOLDER_SKILLS, 1: PLACEHOLDER_SKILLS }
};

const getSkillsFor = (areaKey, level) => LEVEL_SKILLS[areaKey]?.[level] || PLACEHOLDER_SKILLS;

// ─── Barra de percentil (gradiente dinámico, no escalones fijos) ─────────────
function PercentileBar({ percentile, color = PRIMARY }) {
  return (
    <div>
      <div
        className="h-2.5 w-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color} ${percentile}%, #e5e7eb ${percentile}%)` }}
      />
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
      </div>
    </div>
  );
}

// ─── Grilla de nivel de desempeño (escalón + flecha) ─────────────────────────
function PerformanceLevelGrid({ level }) {
  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((l) => (
          <div key={l} className="flex flex-col items-center gap-1">
            {l === level ? (
              <span className="text-xs" style={{ color: LEVEL_COLORS[l - 1] }}>▼</span>
            ) : (
              <span className="text-xs text-transparent select-none">▼</span>
            )}
            <div
              className="h-9 w-full rounded-md border flex items-center justify-center text-sm font-bold transition-colors duration-200"
              style={
                l <= level
                  ? { backgroundColor: LEVEL_COLORS[l - 1], borderColor: LEVEL_COLORS[l - 1], color: '#fff' }
                  : { backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#cbd5e1' }
              }
            >
              {l}
            </div>
          </div>
        ))}
      </div>
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

// ─── Modal "¿Cómo se calcula?" ────────────────────────────────────────────────
function CalcModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold" style={{ color: PRIMARY }}>¿Cómo se calcula tu puntaje?</h3>
        <p className="text-sm text-slate-600 leading-relaxed">
          SIEPA estima tu nivel académico (theta) usando un modelo de Teoría de Respuesta al Ítem (TRI):
          cada pregunta tiene un nivel de dificultad y discriminación propios, así que acertar preguntas
          difíciles pesa más que acertar preguntas fáciles.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          Ese nivel (theta) se convierte a la escala ICFES de 0 a 500 para el puntaje global, y a una
          escala de 0 a 100 por cada prueba. El percentil indica qué porcentaje de una distribución
          estadística de referencia quedó por debajo de tu resultado.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: PRIMARY }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

// ─── Selector de comparación (curso / institucional) ─────────────────────────
function ComparisonCard({ comparison, scope, onScopeChange }) {
  const active = scope === 'course' ? comparison?.course : comparison?.school;
  const hasData = active && active.count > 0 && active.avgOverallTheta !== null;
  const score = hasData ? thetaToGlobal(active.avgOverallTheta) : null;

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value)}
          className="w-full bg-transparent text-sm font-medium text-slate-600 focus:outline-none"
        >
          <option value="course">Promedio del curso</option>
          <option value="school">Promedio institucional</option>
        </select>
      </div>
      <div className="px-4 py-4 text-center">
        {hasData ? (
          <>
            <span className="text-3xl font-black" style={{ color: PRIMARY }}>{score}</span>
            <span className="text-sm text-slate-400">/500</span>
            <p className="text-xs text-slate-400 mt-1">
              Basado en {active.count} estudiante{active.count !== 1 ? 's' : ''}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400 py-2">Aún no hay suficientes datos de tus compañeros.</p>
        )}
      </div>
    </div>
  );
}

// ─── Panel de detalle por área ────────────────────────────────────────────────
function AreaDetailPanel({ moduleItem }) {
  const cfg = getAreaConfig(moduleItem.moduleName);
  const score = thetaToModule(moduleItem.theta);
  const percentile = toPercentile(moduleItem.theta);
  const { level } = getPerformanceLevel(score);
  const skills = getSkillsFor(cfg.areaKey, level);

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6 p-5">
      {/* Columna izquierda: puntaje + percentil */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: cfg.color }}>Prueba</p>
          <p className="text-lg font-bold text-slate-800">{moduleItem.moduleName}</p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: cfg.bg }}
          >
            {cfg.icon}
          </div>
          <div>
            <span className="text-3xl font-black" style={{ color: cfg.color }}>{score}</span>
            <span className="text-sm text-slate-400">/100</span>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-1">¿En qué percentil estás?</p>
          <PercentileBar percentile={percentile} color={cfg.color} />
          <p className="text-xs text-slate-500 mt-2">
            Superaste al <strong>{percentile}%</strong> en esta prueba (referencia estadística SIEPA).
          </p>
        </div>
      </div>

      {/* Columna derecha: nivel de desempeño + habilidades */}
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">Nivel de desempeño</p>
          <PerformanceLevelGrid level={level} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">¿Qué habilidades reflejan este nivel?</p>
          <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
            {skills.map((skill, idx) => (
              <p key={idx} className="text-sm text-slate-600 leading-relaxed flex gap-2">
                <span className="shrink-0" style={{ color: cfg.color }}>▸</span>
                {skill}
              </p>
            ))}
          </div>
        </div>
      </div>
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
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(!isTeacherView);
  const [error, setError] = useState('');
  const [explanations, setExplanations] = useState({});
  const [selectedModule, setSelectedModule] = useState(null);
  const [compareScope, setCompareScope] = useState('course');
  const [showCalcModal, setShowCalcModal] = useState(false);

  useEffect(() => {
    if (isTeacherView) return;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getSimulacroStudentResults(id);
        setResult(response.result);
        setComparison(response.comparison || null);
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

  useEffect(() => {
    if (moduleRows.length === 1) setSelectedModule(moduleRows[0].moduleName);
  }, [moduleRows]);

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
        <h1 className="text-3xl font-bold" style={{ color: PRIMARY }}>Resultados del Simulacro</h1>
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
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} />
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

  const activeModule = moduleRows.find((m) => m.moduleName === selectedModule) || null;

  return (
    <div className="space-y-6 pb-10">
      {showCalcModal ? <CalcModal onClose={() => setShowCalcModal(false)} /> : null}

      {/* ── Título + exportar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">SIEPA · Saber 11</p>
          <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Reporte general</h1>
          <p className="text-sm text-slate-500">{simulacroTitle}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span>🖨️</span> Exportar PDF
        </button>
      </div>
      <hr className="border-slate-200 print:hidden" />

      {/* ── Reporte general: puntaje global + percentil ─────────────────────── */}
      <section className="grid lg:grid-cols-[320px_1fr] gap-5">
        {/* Puntaje global */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">Puntaje global</span>
            <div>
              <span className="text-4xl font-black leading-none" style={{ color: PRIMARY }}>{globalScore}</span>
              <span className="text-base text-gray-400">/500</span>
            </div>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setShowCalcModal(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: ACCENT, color: ACCENT }}
            >
              ¿Cómo se calcula?
            </button>
          </div>
          <ComparisonCard comparison={comparison} scope={compareScope} onScopeChange={setCompareScope} />
        </div>

        {/* Percentil general */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col justify-center gap-4">
          <span className="text-sm font-semibold text-slate-500">¿En qué percentil estás?</span>
          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-slate-500">Referencia estadística SIEPA</span>
                <span className="text-2xl font-black" style={{ color: PRIMARY }}>{percentile}</span>
              </div>
              <PercentileBar percentile={percentile} />
            </div>
            <p className="text-sm text-slate-600">
              Tu puntaje superó al <strong>{percentile}%</strong> de una distribución estadística de referencia.
            </p>
          </div>

          {/* Métricas secundarias */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400">Tiempo empleado</p>
              <p className="text-xl font-bold text-slate-700">
                {durationMinutes !== null ? `${durationMinutes} min` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Respuestas correctas</p>
              <p className="text-xl font-bold text-slate-700">{correctAnswers}/{totalAnswers}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Puntaje por pruebas (tabs) ───────────────────────────────────────── */}
      {moduleRows.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <p className="text-lg font-bold px-5 pt-5" style={{ color: PRIMARY }}>Puntaje por pruebas</p>

          {moduleRows.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto px-5 pt-4 pb-2">
              {moduleRows.map((item) => {
                const cfg = getAreaConfig(item.moduleName);
                const score = thetaToModule(item.theta);
                const active = selectedModule === item.moduleName;
                return (
                  <button
                    key={item.moduleName}
                    type="button"
                    onClick={() => setSelectedModule(item.moduleName)}
                    className="shrink-0 flex flex-col items-center gap-1 rounded-xl border-2 px-4 py-2.5 min-w-[110px] transition-colors duration-150"
                    style={active ? { borderColor: cfg.color, backgroundColor: cfg.bg } : { borderColor: '#e2e8f0' }}
                  >
                    <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">{item.moduleName}</span>
                    <span className="flex items-center gap-1">
                      <span>{cfg.icon}</span>
                      <span className="text-lg font-black" style={{ color: cfg.color }}>{score}</span>
                      <span className="text-xs text-slate-400">/100</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="border-t border-slate-100 mt-1">
            {activeModule ? (
              <AreaDetailPanel moduleItem={activeModule} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-5">
                <span className="text-3xl">💡</span>
                <span className="text-sm font-semibold text-slate-600">Conoce a detalle tus resultados</span>
                <span className="text-xs text-slate-400">Da clic sobre una de las pruebas arriba</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── DETALLE DE RESPUESTAS ───────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold" style={{ color: PRIMARY }}>Detalle de respuestas</h2>
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
                              backgroundColor: exp?.loading ? '#9ca3af' : studentTokens.colors.violet,
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
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-5 py-4 text-sm text-violet-700 print:hidden">
          <span className="font-semibold">💡 Consejo:</span> Tienes{' '}
          <strong>{wrongAnswers.length}</strong> pregunta
          {wrongAnswers.length !== 1 ? 's' : ''} incorrecta
          {wrongAnswers.length !== 1 ? 's' : ''}. Haz clic en{' '}
          <strong>"🤖 ¿Por qué me equivoqué?"</strong> para obtener una explicación
          personalizada con IA.
        </div>
      )}

      {/* ── BOTONES FINALES ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 pt-2 print:hidden">
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
          style={{ backgroundColor: PRIMARY }}
        >
          Ver mis simulacros
        </button>
      </div>
    </div>
  );
}

export default SimulacroResults;
