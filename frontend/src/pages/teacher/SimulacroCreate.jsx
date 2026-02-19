import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createManualSimulacro } from '../../services/api';
import SimulacroQuestionPicker from './SimulacroQuestionPicker.jsx';

const MODULE_OPTIONS = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

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
    return modules.every((moduleItem) => Array.isArray(moduleItem.questions) && moduleItem.questions.length > 0);
  }, [form.title, modules]);

  const addModule = () => {
    if (modules.some((moduleItem) => moduleItem.name === moduleToAdd)) return;

    setModules((prev) => [
      ...prev,
      {
        name: moduleToAdd,
        timeLimit: '',
        questions: []
      }
    ]);
  };

  const removeModule = (name) => {
    setModules((prev) => prev.filter((moduleItem) => moduleItem.name !== name));
  };

  const setModuleQuestions = (name, questions) => {
    setModules((prev) => prev.map((moduleItem) => (
      moduleItem.name === name ? { ...moduleItem, questions } : moduleItem
    )));
  };

  const setModuleTimeLimit = (name, value) => {
    setModules((prev) => prev.map((moduleItem) => (
      moduleItem.name === name ? { ...moduleItem, timeLimit: value } : moduleItem
    )));
  };

  const save = async () => {
    if (!canSubmit) {
      setError('Completa titulo y agrega al menos 1 pregunta por modulo.');
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
        modules: modules.map((moduleItem) => ({
          name: moduleItem.name,
          timeLimit: moduleItem.timeLimit ? Number(moduleItem.timeLimit) : null,
          questions: moduleItem.questions.map((questionItem, index) => ({
            question: questionItem.question || null,
            embeddedQuestion: questionItem.embeddedQuestion || null,
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Crear Simulacro Manual</h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard/docente/simulacros')}
          className="bg-gray-200 px-4 py-2 rounded-lg"
        >
          Volver
        </button>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}

      <section className="bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            placeholder="Titulo"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
          <input
            type="number"
            min="30"
            max="360"
            value={form.globalTimeLimit}
            onChange={(event) => setForm((prev) => ({ ...prev, globalTimeLimit: event.target.value }))}
            className="border rounded-lg px-3 py-2"
            placeholder="Tiempo global (min)"
          />
        </div>

        <textarea
          rows="3"
          placeholder="Descripcion"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          className="w-full border rounded-lg px-3 py-2"
        />

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.strictMode}
            onChange={(event) => setForm((prev) => ({ ...prev, strictMode: event.target.checked }))}
          />
          Strict mode (bloquea navegacion fuera de orden)
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={moduleToAdd}
            onChange={(event) => setModuleToAdd(event.target.value)}
            className="border rounded-lg px-3 py-2"
          >
            {MODULE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button type="button" onClick={addModule} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg">Agregar modulo</button>
        </div>
      </section>

      {modules.map((moduleItem) => (
        <section key={moduleItem.name} className="space-y-3 border border-gray-200 bg-gray-50 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-[#0A2E57]">Modulo: {moduleItem.name}</h2>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="180"
                value={moduleItem.timeLimit}
                onChange={(event) => setModuleTimeLimit(moduleItem.name, event.target.value)}
                placeholder="Tiempo modulo (min)"
                className="border rounded-lg px-3 py-2"
              />
              <button
                type="button"
                onClick={() => removeModule(moduleItem.name)}
                className="bg-red-600 text-white px-3 py-2 rounded-lg"
              >
                Quitar modulo
              </button>
            </div>
          </div>

          <SimulacroQuestionPicker
            moduleName={moduleItem.name}
            selectedQuestions={moduleItem.questions}
            onChange={(questions) => setModuleQuestions(moduleItem.name, questions)}
          />
        </section>
      ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={loading || !canSubmit}
          className="bg-emerald-600 text-white px-5 py-2 rounded-lg disabled:opacity-60"
        >
          {loading ? 'Guardando...' : 'Guardar simulacro'}
        </button>
      </div>
    </div>
  );
}

export default SimulacroCreate;
