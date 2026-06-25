import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createManualSimulacro } from '../../services/api';
import SimulacroQuestionPicker from './SimulacroQuestionPicker.jsx';

const MODULE_OPTIONS = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

const AREA_STYLES = {
  Lectura:     { border: 'border-blue-300',    header: 'bg-blue-600',    bg: 'bg-blue-50',    icon: '📖' },
  Matematicas: { border: 'border-emerald-300', header: 'bg-emerald-600', bg: 'bg-emerald-50', icon: '📐' },
  Sociales:    { border: 'border-purple-300',  header: 'bg-purple-600',  bg: 'bg-purple-50',  icon: '🌍' },
  Ciencias:    { border: 'border-orange-300',  header: 'bg-orange-500',  bg: 'bg-orange-50',  icon: '🔬' },
  Ingles:      { border: 'border-red-300',     header: 'bg-red-600',     bg: 'bg-red-50',     icon: '🇬🇧' },
};

function SimulacroCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    description: '',
    globalTimeLimit: 240,
    strictMode: false
  });

  const [moduleToAdd, setModuleToAdd] = useState(MODULE_OPTIONS[0]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => {
    if (!form.title.trim()) return false;
    if (!modules.length) return false;
    return modules.every((m) => Array.isArray(m.questions) && m.questions.length > 0);
  }, [form.title, modules]);

  const totalQuestions = useMemo(
    () => modules.reduce((acc, m) => acc + (m.questions?.length || 0), 0),
    [modules]
  );
  const totalMinutes = useMemo(
    () => modules.reduce((acc, m) => acc + (Number(m.timeLimit) || 0), 0),
    [modules]
  );

  const alreadyAdded = modules.some((m) => m.name === moduleToAdd);

  const addModule = () => {
    if (alreadyAdded) return;
    setModules((prev) => [...prev, { name: moduleToAdd, timeLimit: '', questions: [] }]);
  };

  const removeModule = (name) => setModules((prev) => prev.filter((m) => m.name !== name));

  const setModuleQuestions = (name, questions) => {
    setModules((prev) => prev.map((m) => (m.name === name ? { ...m, questions } : m)));
  };

  const setModuleTimeLimit = (name, value) => {
    setModules((prev) => prev.map((m) => (m.name === name ? { ...m, timeLimit: value } : m)));
  };

  const save = async () => {
    if (!canSubmit) {
      setError('Completa el título y agrega al menos 1 pregunta por prueba.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        strictMode: Boolean(form.strictMode),
        globalTimeLimit: form.globalTimeLimit ? Number(form.globalTimeLimit) : null,
        modules: modules.map((m) => ({
          name: m.name,
          timeLimit: m.timeLimit ? Number(m.timeLimit) : null,
          questions: m.questions.map((q, index) => ({
            question: q.question || null,
            embeddedQuestion: q.embeddedQuestion || null,
            order: index + 1
          }))
        }))
      };
      const response = await createManualSimulacro(payload);
      navigate(`/dashboard/docente/simulacros/${response.simulacro._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear el simulacro manual');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">Crear Simulacro</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Arma el examen por pruebas ICFES, elige preguntas del banco o créalas al instante.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/docente/simulacros')}
          className="text-sm border border-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50"
        >
          Volver
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      ) : null}

      {/* ── Configuración general ── */}
      <section className="bg-white rounded-2xl shadow p-6 space-y-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Configuración del simulacro</p>

        {/* Título + Tiempo en una sola fila */}
        <div className="grid md:grid-cols-[1fr_200px] gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título del simulacro</label>
            <input
              placeholder="Ej. Simulacro ICFES – Grado 11 – Junio 2025"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tiempo total (minutos)</label>
            <input
              type="number"
              min="30"
              max="360"
              value={form.globalTimeLimit}
              onChange={(e) => setForm((prev) => ({ ...prev, globalTimeLimit: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
          <textarea
            rows="2"
            placeholder="Ej. Simulacro de práctica — primer corte"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Toggle Modo examen */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.strictMode}
            onClick={() => setForm((prev) => ({ ...prev, strictMode: !prev.strictMode }))}
            className={`mt-0.5 relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              form.strictMode ? 'bg-[#0A2E57]' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                form.strictMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-slate-700">Modo examen</p>
            <p className="text-xs text-slate-500">El estudiante no puede volver a preguntas anteriores</p>
          </div>
        </div>

        {/* ── Selector Agregar prueba ── */}
        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Agregar prueba al simulacro</p>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={moduleToAdd}
              onChange={(e) => setModuleToAdd(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white min-w-36"
            >
              {MODULE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addModule}
              disabled={alreadyAdded}
              className="inline-flex items-center gap-2 bg-[#0A2E57] hover:bg-[#123e71] text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors shadow-sm"
            >
              <span className="text-base leading-none">＋</span>
              Agregar prueba
            </button>
            {alreadyAdded && (
              <span className="text-xs text-slate-400">Esta prueba ya está en el simulacro</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Pruebas (módulos) ── */}
      {modules.map((m) => {
        const style = AREA_STYLES[m.name] || { border: 'border-slate-300', header: 'bg-slate-600', bg: 'bg-slate-50', icon: '📋' };
        return (
          <section key={m.name} className={`rounded-2xl border-2 ${style.border} ${style.bg} overflow-hidden`}>
            {/* Header coloreado por área */}
            <div className={`${style.header} px-5 py-3 flex flex-wrap items-center justify-between gap-3`}>
              <h2 className="text-white font-semibold text-lg">
                {style.icon} Prueba de {m.name}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-white/80 text-xs font-medium whitespace-nowrap">
                    Tiempo de esta prueba (min)
                  </span>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={m.timeLimit}
                    onChange={(e) => setModuleTimeLimit(m.name, e.target.value)}
                    placeholder="ej. 60"
                    className="w-20 rounded-lg px-2 py-1 text-sm text-slate-800 bg-white/90 border-0 focus:ring-2 focus:ring-white/50"
                  />
                </label>
                <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                  {m.questions.length} {m.questions.length === 1 ? 'pregunta' : 'preguntas'} seleccionadas
                </span>
                <button
                  type="button"
                  onClick={() => removeModule(m.name)}
                  className="text-white/60 hover:text-white text-xs underline underline-offset-2"
                >
                  Quitar prueba
                </button>
              </div>
            </div>

            <div className="p-4">
              <SimulacroQuestionPicker
                moduleName={m.name}
                selectedQuestions={m.questions}
                onChange={(questions) => setModuleQuestions(m.name, questions)}
              />
            </div>
          </section>
        );
      })}

      {/* ── Barra de resumen ── */}
      {modules.length > 0 && (
        <section className="bg-white rounded-2xl shadow p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Resumen del simulacro</p>
          <div className="space-y-1.5">
            {modules.map((m) => {
              const style = AREA_STYLES[m.name] || { icon: '📋' };
              return (
                <p key={m.name} className="text-sm text-slate-700">
                  {style.icon} Prueba de {m.name}:{' '}
                  <span className="font-medium">
                    {m.questions.length} {m.questions.length === 1 ? 'pregunta' : 'preguntas'}
                  </span>
                  {m.timeLimit ? (
                    <span className="text-slate-500"> · {m.timeLimit} min</span>
                  ) : null}
                </p>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-sm font-semibold text-slate-800">
              {'⏱ Total: '}
              {totalQuestions} {totalQuestions === 1 ? 'pregunta' : 'preguntas'}
              {totalMinutes > 0 ? ` · ${totalMinutes} minutos` : ''}
            </p>
          </div>
        </section>
      )}

      {/* ── Guardar ── */}
      <div className="flex items-center gap-4 pb-6">
        <button
          type="button"
          onClick={save}
          disabled={loading || !canSubmit}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors shadow-sm"
        >
          {loading ? 'Guardando...' : 'Guardar simulacro'}
        </button>
        {!canSubmit && !loading && (
          <p className="text-xs text-slate-400">
            {!form.title.trim()
              ? 'Falta el título'
              : !modules.length
              ? 'Agrega al menos una prueba'
              : 'Falta agregar preguntas a alguna prueba'}
          </p>
        )}
      </div>
    </div>
  );
}

export default SimulacroCreate;
