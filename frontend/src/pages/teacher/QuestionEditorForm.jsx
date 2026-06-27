import { useMemo, useState } from 'react';
import LatexPreview from '../../components/ui/LatexPreview.jsx';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const AREA_OPTIONS = ['matematicas', 'lectura', 'ciencias', 'sociales', 'ingles'];
const NIVEL_OPTIONS = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];

const DIFICULTAD_PILLS = [
  { value: 'baja',  label: 'Fácil',  dot: '🟢' },
  { value: 'media', label: 'Media',  dot: '🟡' },
  { value: 'alta',  label: 'Difícil', dot: '🔴' },
];

const emptyOption = (label) => ({
  label,
  text: '',
  image: null,
  newImageFile: null,
  newImagePreview: ''
});

const mapInitial = (initialData) => {
  const baseOptions = Array.isArray(initialData?.options) && initialData.options.length
    ? initialData.options.map((option) => ({
        label: option.label,
        text: option.text || '',
        image: option.image || null,
        newImageFile: null,
        newImagePreview: ''
      }))
    : OPTION_LABELS.slice(0, 4).map((label) => emptyOption(label));

  return {
    statementText: initialData?.statement?.text || '',
    latex: initialData?.latex || '',
    statementImagesExisting: initialData?.statement?.images || [],
    statementImageFiles: [],
    statementImagePreviews: [],
    options: baseOptions,
    correctAnswer: initialData?.correctAnswer || baseOptions[0].label,
    area: initialData?.area || AREA_OPTIONS[0],
    competencia: initialData?.competencia || '',
    nivelCognitivo: initialData?.nivelCognitivo || 'comprender',
    dificultadCualitativa: initialData?.dificultadCualitativa || 'media',
    triA: initialData?.triParams?.a ?? 1,
    triB: initialData?.triParams?.b ?? 0,
    triC: initialData?.triParams?.c ?? 0.2,
    visibility: initialData?.visibility || 'private',
    calibrationStatus: initialData?.calibrationStatus || 'experimental'
  };
};

const validate = (state) => {
  if (!state.statementText.trim() && !state.latex.trim()) return 'Debes ingresar texto o LaTeX en el enunciado.';
  if (!state.area.trim()) return 'Área es requerida.';
  if (!state.competencia.trim()) return 'Competencia es requerida.';
  if (state.options.length < 4 || state.options.length > 8) return 'Debes tener entre 4 y 8 opciones.';
  if (state.options.some((option) => !option.text.trim())) return 'Todas las opciones deben tener texto.';
  if (!state.options.some((option) => option.label === state.correctAnswer)) return 'La respuesta correcta no existe en las opciones.';

  const triA = Number(state.triA);
  const triB = Number(state.triB);
  const triC = Number(state.triC);

  if (Number.isNaN(triA) || triA <= 0 || triA > 3) return 'Discriminación (a) debe estar entre 0.01 y 3.';
  if (Number.isNaN(triB) || triB < -3 || triB > 3) return 'Dificultad (b) debe estar entre -3 y 3.';
  if (Number.isNaN(triC) || triC < 0 || triC > 0.5) return 'Probabilidad de acierto (c) debe estar entre 0 y 0.5.';

  return '';
};

function QuestionEditorForm({
  initialData,
  submitLabel,
  submitting,
  serverError,
  onSubmit,
  onCancel
}) {
  const [state, setState] = useState(() => mapInitial(initialData));
  const [clientError, setClientError] = useState('');

  const canAddOption = useMemo(() => state.options.length < 8, [state.options.length]);
  const canRemoveOption = useMemo(() => state.options.length > 4, [state.options.length]);

  const setField = (name, value) => setState((prev) => ({ ...prev, [name]: value }));

  const handleDropStatement = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setState((prev) => ({
      ...prev,
      statementImageFiles: [...prev.statementImageFiles, ...files],
      statementImagePreviews: [...prev.statementImagePreviews, ...files.map((f) => URL.createObjectURL(f))]
    }));
  };

  const handleStatementFileInput = (event) => {
    const files = Array.from(event.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setState((prev) => ({
      ...prev,
      statementImageFiles: [...prev.statementImageFiles, ...files],
      statementImagePreviews: [...prev.statementImagePreviews, ...files.map((f) => URL.createObjectURL(f))]
    }));
  };

  const removeExistingStatementImage = (index) => {
    setState((prev) => ({
      ...prev,
      statementImagesExisting: prev.statementImagesExisting.filter((_, idx) => idx !== index)
    }));
  };

  const removeNewStatementImage = (index) => {
    setState((prev) => ({
      ...prev,
      statementImageFiles: prev.statementImageFiles.filter((_, idx) => idx !== index),
      statementImagePreviews: prev.statementImagePreviews.filter((_, idx) => idx !== index)
    }));
  };

  const addOption = () => {
    if (!canAddOption) return;
    setState((prev) => ({
      ...prev,
      options: [...prev.options, emptyOption(OPTION_LABELS[prev.options.length])]
    }));
  };

  const removeOption = () => {
    if (!canRemoveOption) return;
    setState((prev) => {
      const nextOptions = prev.options.slice(0, -1);
      return {
        ...prev,
        options: nextOptions,
        correctAnswer: nextOptions.some((o) => o.label === prev.correctAnswer)
          ? prev.correctAnswer
          : nextOptions[0].label
      };
    });
  };

  const updateOption = (index, updates) => {
    setState((prev) => {
      const next = [...prev.options];
      next[index] = { ...next[index], ...updates };
      return { ...prev, options: next };
    });
  };

  const setOptionImageFile = (index, file) => {
    if (!file || !file.type.startsWith('image/')) return;
    updateOption(index, { newImageFile: file, newImagePreview: URL.createObjectURL(file) });
  };

  const dropOptionImage = (event, index) => {
    event.preventDefault();
    const [file] = Array.from(event.dataTransfer.files || []);
    setOptionImageFile(index, file);
  };

  const submit = async (event) => {
    event.preventDefault();
    setClientError('');
    const validation = validate(state);
    if (validation) { setClientError(validation); return; }

    const payload = {
      statement: { text: state.statementText, images: state.statementImagesExisting },
      latex: state.latex,
      options: state.options.map((o) => ({
        label: o.label,
        text: o.text,
        image: o.newImageFile ? null : o.image || null
      })),
      correctAnswer: state.correctAnswer,
      area: state.area,
      competencia: state.competencia,
      nivelCognitivo: state.nivelCognitivo,
      dificultadCualitativa: state.dificultadCualitativa,
      triParams: { a: Number(state.triA), b: Number(state.triB), c: Number(state.triC) },
      visibility: state.visibility,
      calibrationStatus: state.calibrationStatus
    };

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    state.statementImageFiles.forEach((file) => formData.append('statementImages', file));
    state.options.forEach((o) => {
      if (o.newImageFile) formData.append(`optionImage${o.label}`, o.newImageFile);
    });

    await onSubmit(formData);
  };

  return (
    <form onSubmit={submit} className="bg-white p-6 rounded-2xl shadow space-y-6">
      {(clientError || serverError) ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {clientError || serverError}
        </div>
      ) : null}

      {/* ── Enunciado ── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Enunciado</label>
        <textarea
          value={state.statementText}
          onChange={(e) => setField('statementText', e.target.value)}
          rows="5"
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Escribe el enunciado de la pregunta..."
        />
      </div>

      {/* ── Imágenes del enunciado ── */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">Imágenes del enunciado</label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropStatement}
          className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-sm text-slate-500 hover:border-slate-400 transition-colors"
        >
          Arrastra imágenes aquí o selecciona desde tu equipo.
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleStatementFileInput}
            className="block mt-3 text-sm"
          />
        </div>
        {(state.statementImagesExisting.length > 0 || state.statementImagePreviews.length > 0) ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {state.statementImagesExisting.map((image, index) => (
              <div key={`existing-${image.url}-${index}`} className="border rounded-lg p-2">
                <img src={image.url} alt="Enunciado" className="w-full h-24 object-cover rounded" />
                <button type="button" onClick={() => removeExistingStatementImage(index)} className="text-xs text-red-600 mt-2">Quitar</button>
              </div>
            ))}
            {state.statementImagePreviews.map((preview, index) => (
              <div key={`new-${preview}-${index}`} className="border rounded-lg p-2">
                <img src={preview} alt="Preview" className="w-full h-24 object-cover rounded" />
                <button type="button" onClick={() => removeNewStatementImage(index)} className="text-xs text-red-600 mt-2">Quitar</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Área + Competencia ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Área</label>
          <select
            value={state.area}
            onChange={(e) => setField('area', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {AREA_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Competencia</label>
          <input
            value={state.competencia}
            onChange={(e) => setField('competencia', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Ej. Interpretación y comprensión"
          />
        </div>
      </div>

      {/* ── Dificultad (pills) ── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Dificultad</label>
        <div className="flex gap-2">
          {DIFICULTAD_PILLS.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => setField('dificultadCualitativa', pill.value)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                state.dificultadCualitativa === pill.value
                  ? 'bg-[#0A2E57] text-white border-[#0A2E57]'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              {pill.dot} {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Opciones A–D (solo texto) ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-700">Opciones de respuesta</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={removeOption}
              disabled={!canRemoveOption}
              className="text-xs px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-slate-50"
            >
              − Quitar
            </button>
            <button
              type="button"
              onClick={addOption}
              disabled={!canAddOption}
              className="text-xs px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-slate-50"
            >
              ＋ Agregar
            </button>
          </div>
        </div>

        {state.options.map((option, index) => (
          <div key={option.label} className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-slate-500 w-6 shrink-0">{option.label}</span>
              <input
                value={option.text}
                onChange={(e) => updateOption(index, { text: e.target.value })}
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
                placeholder={`Texto de la opción ${option.label}`}
              />
            </div>
            <div className="ml-9">
              {(option.newImageFile || option.image?.url) ? (
                <div className="inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                  <img
                    src={option.newImagePreview || option.image?.url}
                    alt=""
                    className="h-7 w-10 object-cover rounded"
                  />
                  <span className="max-w-36 truncate">{option.newImageFile?.name || 'imagen'}</span>
                  <button
                    type="button"
                    onClick={() => updateOption(index, { newImageFile: null, newImagePreview: '', image: null })}
                    className="text-slate-400 hover:text-red-500 leading-none"
                    aria-label="Quitar imagen"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
                  📎 Agregar imagen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setOptionImageFile(index, e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Respuesta correcta ── */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Respuesta correcta</label>
        <select
          value={state.correctAnswer}
          onChange={(e) => setField('correctAnswer', e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          {state.options.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Configuración avanzada (colapsada por defecto) ── */}
      <details className="border border-slate-200 rounded-xl overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 select-none list-none flex items-center gap-2">
          <span className="text-xs">▸</span>
          Configuración avanzada — LaTeX, parámetros de calibración, visibilidad
        </summary>

        <div className="p-4 space-y-5">
          {/* LaTeX */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">LaTeX (opcional)</label>
            <input
              value={state.latex}
              onChange={(e) => setField('latex', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Ejemplo: \frac{a}{b}"
            />
            <div className="mt-2">
              <LatexPreview latex={state.latex} />
            </div>
          </div>

          {/* Nivel cognitivo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nivel cognitivo</label>
            <select
              value={state.nivelCognitivo}
              onChange={(e) => setField('nivelCognitivo', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {NIVEL_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Parámetros de calibración */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              Parámetros de calibración{' '}
              <span className="text-xs font-normal text-slate-400">(se calibran automáticamente con uso real)</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'triA', label: 'a — Discriminación', step: '0.01' },
                { key: 'triB', label: 'b — Dificultad',     step: '0.01' },
                { key: 'triC', label: 'c — Adivinanza',     step: '0.01' },
              ].map(({ key, label, step }) => (
                <div key={key}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input
                    type="number"
                    step={step}
                    value={state[key]}
                    onChange={(e) => setField(key, e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Visibilidad + Calibración */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Visibilidad</label>
              <select
                value={state.visibility}
                onChange={(e) => setField('visibility', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="private">Privada</option>
                <option value="institutional">Institucional</option>
                <option value="national">Nacional</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Calibración</label>
              <select
                value={state.calibrationStatus}
                onChange={(e) => setField('calibrationStatus', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="experimental">Experimental</option>
                <option value="calibrated">Calibrada</option>
              </select>
            </div>
          </div>

        </div>
      </details>

      {/* ── Acciones ── */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-[#0A2E57] hover:bg-[#123e71] text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Guardando...' : (submitLabel || 'Guardar')}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="border border-slate-300 text-slate-700 px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default QuestionEditorForm;
