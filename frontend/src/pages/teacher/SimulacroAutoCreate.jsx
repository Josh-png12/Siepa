import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAutoSimulacro, listQuestions } from '../../services/api';

const MODULE_OPTIONS = ['Lectura', 'Matematicas', 'Sociales', 'Ciencias', 'Ingles'];

function SimulacroAutoCreate() {
  const navigate = useNavigate();

  const [header, setHeader] = useState({
    title: '',
    description: '',
    globalTimeLimit: 240,
    strictMode: false
  });

  const [moduleToAdd, setModuleToAdd] = useState(MODULE_OPTIONS[0]);
  const [modules, setModules] = useState([]);

  const [preview, setPreview] = useState({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addModule = () => {
    if (modules.some((item) => item.name === moduleToAdd)) return;

    setModules((prev) => ([
      ...prev,
      {
        name: moduleToAdd,
        area: '',
        competencia: '',
        totalQuestions: 10,
        targetTheta: 0,
        timeLimit: ''
      }
    ]));
  };

  const removeModule = (name) => {
    setModules((prev) => prev.filter((item) => item.name !== name));
    setPreview((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const setModuleField = (name, key, value) => {
    setModules((prev) => prev.map((item) => (
      item.name === name ? { ...item, [key]: value } : item
    )));
  };

  const previewModule = async (moduleItem) => {
    try {
      setLoadingPreview(true);
      setError('');

      const response = await listQuestions({
        area: moduleItem.area || undefined,
        competencia: moduleItem.competencia || undefined,
        estado: 'publicada',
        bMin: Number(moduleItem.targetTheta) - 1,
        bMax: Number(moduleItem.targetTheta) + 1,
        limit: Number(moduleItem.totalQuestions),
        sort: 'triParams.b:asc'
      });

      setPreview((prev) => ({
        ...prev,
        [moduleItem.name]: response.items || []
      }));
    } catch (err) {
      setError(err.response?.data?.message || `No se pudo generar preview de ${moduleItem.name}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  const save = async () => {
    if (!header.title.trim() || modules.length === 0) {
      setError('Debes configurar titulo y al menos un modulo.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const response = await createAutoSimulacro({
        title: header.title.trim(),
        description: header.description.trim(),
        globalTimeLimit: header.globalTimeLimit ? Number(header.globalTimeLimit) : null,
        strictMode: Boolean(header.strictMode),
        modules: modules.map((item) => ({
          name: item.name,
          area: item.area || undefined,
          competencia: item.competencia || undefined,
          totalQuestions: Number(item.totalQuestions),
          targetTheta: Number(item.targetTheta),
          timeLimit: item.timeLimit ? Number(item.timeLimit) : null
        }))
      });

      navigate(`/dashboard/docente/simulacros/${response.simulacro._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear simulacro automatico');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Crear Simulacro Inteligente</h1>
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
            value={header.title}
            onChange={(event) => setHeader((prev) => ({ ...prev, title: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
          <input
            type="number"
            min="30"
            max="360"
            value={header.globalTimeLimit}
            onChange={(event) => setHeader((prev) => ({ ...prev, globalTimeLimit: event.target.value }))}
            className="border rounded-lg px-3 py-2"
            placeholder="Tiempo global (min)"
          />
        </div>

        <textarea
          rows="3"
          placeholder="Descripcion"
          value={header.description}
          onChange={(event) => setHeader((prev) => ({ ...prev, description: event.target.value }))}
          className="w-full border rounded-lg px-3 py-2"
        />

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={header.strictMode}
            onChange={(event) => setHeader((prev) => ({ ...prev, strictMode: event.target.checked }))}
          />
          Strict mode
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
        <section key={moduleItem.name} className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="flex justify-between items-center gap-3">
            <h2 className="text-xl font-semibold text-[#0A2E57]">{moduleItem.name}</h2>
            <button type="button" onClick={() => removeModule(moduleItem.name)} className="bg-red-600 text-white px-3 py-1 rounded">Quitar</button>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            <input
              placeholder="Area"
              value={moduleItem.area}
              onChange={(event) => setModuleField(moduleItem.name, 'area', event.target.value)}
              className="border rounded-lg px-3 py-2"
            />
            <input
              placeholder="Competencia"
              value={moduleItem.competencia}
              onChange={(event) => setModuleField(moduleItem.name, 'competencia', event.target.value)}
              className="border rounded-lg px-3 py-2"
            />
            <input
              type="number"
              min="1"
              max="120"
              value={moduleItem.totalQuestions}
              onChange={(event) => setModuleField(moduleItem.name, 'totalQuestions', event.target.value)}
              className="border rounded-lg px-3 py-2"
              placeholder="Preguntas"
            />
            <input
              type="number"
              step="0.1"
              value={moduleItem.targetTheta}
              onChange={(event) => setModuleField(moduleItem.name, 'targetTheta', event.target.value)}
              className="border rounded-lg px-3 py-2"
              placeholder="Theta objetivo"
            />
            <input
              type="number"
              min="5"
              max="180"
              value={moduleItem.timeLimit}
              onChange={(event) => setModuleField(moduleItem.name, 'timeLimit', event.target.value)}
              className="border rounded-lg px-3 py-2"
              placeholder="Tiempo modulo"
            />
          </div>

          <button
            type="button"
            onClick={() => previewModule(moduleItem)}
            disabled={loadingPreview}
            className="bg-blue-600 text-white px-3 py-2 rounded-lg disabled:opacity-60"
          >
            {loadingPreview ? 'Calculando...' : `Preview ${moduleItem.name}`}
          </button>

          <div className="space-y-2">
            {(preview[moduleItem.name] || []).length === 0 ? (
              <p className="text-sm text-gray-500">Sin preview.</p>
            ) : (
              (preview[moduleItem.name] || []).map((question, idx) => (
                <div key={question._id} className="border rounded-lg p-3">
                  <p className="font-medium">#{idx + 1} - {question.statement?.text || question.latex || '(sin texto)'}</p>
                  <p className="text-xs text-gray-600">
                    {question.area} | {question.competencia} | b={Number(question.triParams?.b ?? 0).toFixed(2)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={save}
        disabled={saving || modules.length === 0}
        className="bg-emerald-600 text-white px-5 py-2 rounded-lg disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar simulacro inteligente'}
      </button>
    </div>
  );
}

export default SimulacroAutoCreate;
