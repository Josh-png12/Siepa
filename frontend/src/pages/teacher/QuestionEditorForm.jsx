import { useMemo, useState } from 'react';
import LatexPreview from '../../components/ui/LatexPreview.jsx';

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const AREA_OPTIONS = ['matematicas', 'lectura', 'ciencias', 'sociales', 'ingles'];
const NIVEL_OPTIONS = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear'];

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
  if (!state.area.trim()) return 'Area es requerida.';
  if (!state.competencia.trim()) return 'Competencia es requerida.';
  if (state.options.length < 4 || state.options.length > 8) return 'Debes tener entre 4 y 8 opciones.';
  if (state.options.some((option) => !option.text.trim())) return 'Todas las opciones deben tener texto.';
  if (!state.options.some((option) => option.label === state.correctAnswer)) return 'La respuesta correcta no existe en las opciones.';

  const triA = Number(state.triA);
  const triB = Number(state.triB);
  const triC = Number(state.triC);

  if (Number.isNaN(triA) || triA <= 0 || triA > 3) return 'TRI a debe estar entre 0.01 y 3.';
  if (Number.isNaN(triB) || triB < -3 || triB > 3) return 'TRI b debe estar entre -3 y 3.';
  if (Number.isNaN(triC) || triC < 0 || triC > 0.5) return 'TRI c debe estar entre 0 y 0.5.';

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

  const setField = (name, value) => {
    setState((prev) => ({ ...prev, [name]: value }));
  };

  const handleDropStatement = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;

    const previews = files.map((file) => URL.createObjectURL(file));

    setState((prev) => ({
      ...prev,
      statementImageFiles: [...prev.statementImageFiles, ...files],
      statementImagePreviews: [...prev.statementImagePreviews, ...previews]
    }));
  };

  const handleStatementFileInput = (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;

    const previews = files.map((file) => URL.createObjectURL(file));

    setState((prev) => ({
      ...prev,
      statementImageFiles: [...prev.statementImageFiles, ...files],
      statementImagePreviews: [...prev.statementImagePreviews, ...previews]
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
      const nextCorrect = nextOptions.some((option) => option.label === prev.correctAnswer)
        ? prev.correctAnswer
        : nextOptions[0].label;

      return {
        ...prev,
        options: nextOptions,
        correctAnswer: nextCorrect
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
    updateOption(index, {
      newImageFile: file,
      newImagePreview: URL.createObjectURL(file)
    });
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
    if (validation) {
      setClientError(validation);
      return;
    }

    const payload = {
      statement: {
        text: state.statementText,
        images: state.statementImagesExisting
      },
      latex: state.latex,
      options: state.options.map((option) => ({
        label: option.label,
        text: option.text,
        image: option.newImageFile ? null : option.image || null
      })),
      correctAnswer: state.correctAnswer,
      area: state.area,
      competencia: state.competencia,
      nivelCognitivo: state.nivelCognitivo,
      dificultadCualitativa: state.dificultadCualitativa,
      triParams: {
        a: Number(state.triA),
        b: Number(state.triB),
        c: Number(state.triC)
      },
      visibility: state.visibility,
      calibrationStatus: state.calibrationStatus
    };

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    state.statementImageFiles.forEach((file) => {
      formData.append('statementImages', file);
    });

    state.options.forEach((option) => {
      if (option.newImageFile) {
        formData.append(`optionImage${option.label}`, option.newImageFile);
      }
    });

    await onSubmit(formData);
  };

  return (
    <form onSubmit={submit} className="bg-white p-6 rounded-2xl shadow space-y-6">
      {(clientError || serverError) ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {clientError || serverError}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium mb-1">Enunciado (texto)</label>
        <textarea
          value={state.statementText}
          onChange={(event) => setField('statementText', event.target.value)}
          rows="5"
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Escribe el enunciado"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">LaTeX (opcional)</label>
        <input
          value={state.latex}
          onChange={(event) => setField('latex', event.target.value)}
          className="w-full border rounded-lg px-3 py-2"
          placeholder="Ejemplo: \\frac{a}{b}"
        />
        <div className="mt-2">
          <LatexPreview latex={state.latex} />
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium">Imagenes del enunciado</label>
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDropStatement}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-600"
        >
          Arrastra imagenes aqui o selecciona desde tu equipo.
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleStatementFileInput}
            className="block mt-3"
          />
        </div>

        {(state.statementImagesExisting.length > 0 || state.statementImagePreviews.length > 0) ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {state.statementImagesExisting.map((image, index) => (
              <div key={`existing-${image.url}-${index}`} className="border rounded-lg p-2">
                <img src={image.url} alt="Enunciado" className="w-full h-24 object-cover rounded" />
                <button type="button" onClick={() => removeExistingStatementImage(index)} className="text-xs text-red-600 mt-2">
                  Quitar
                </button>
              </div>
            ))}
            {state.statementImagePreviews.map((preview, index) => (
              <div key={`new-${preview}-${index}`} className="border rounded-lg p-2">
                <img src={preview} alt="Preview" className="w-full h-24 object-cover rounded" />
                <button type="button" onClick={() => removeNewStatementImage(index)} className="text-xs text-red-600 mt-2">
                  Quitar
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Area</label>
          <select value={state.area} onChange={(event) => setField('area', event.target.value)} className="w-full border rounded-lg px-3 py-2">
            {AREA_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Competencia</label>
          <input value={state.competencia} onChange={(event) => setField('competencia', event.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nivel cognitivo</label>
          <select value={state.nivelCognitivo} onChange={(event) => setField('nivelCognitivo', event.target.value)} className="w-full border rounded-lg px-3 py-2">
            {NIVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Dificultad cualitativa</label>
          <select value={state.dificultadCualitativa} onChange={(event) => setField('dificultadCualitativa', event.target.value)} className="w-full border rounded-lg px-3 py-2">
            <option value="baja">baja</option>
            <option value="media">media</option>
            <option value="alta">alta</option>
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">TRI a</label>
          <input type="number" step="0.01" value={state.triA} onChange={(event) => setField('triA', event.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">TRI b</label>
          <input type="number" step="0.01" value={state.triB} onChange={(event) => setField('triB', event.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">TRI c</label>
          <input type="number" step="0.01" value={state.triC} onChange={(event) => setField('triC', event.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Visibilidad</label>
          <select value={state.visibility} onChange={(event) => setField('visibility', event.target.value)} className="w-full border rounded-lg px-3 py-2">
            <option value="private">private</option>
            <option value="institutional">institutional</option>
            <option value="national">national</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Calibracion</label>
          <select value={state.calibrationStatus} onChange={(event) => setField('calibrationStatus', event.target.value)} className="w-full border rounded-lg px-3 py-2">
            <option value="experimental">experimental</option>
            <option value="calibrated">calibrated</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-[#0A2E57]">Opciones</h3>
          <div className="flex gap-2">
            <button type="button" onClick={removeOption} disabled={!canRemoveOption} className="bg-gray-200 px-3 py-1 rounded disabled:opacity-50">
              Quitar opcion
            </button>
            <button type="button" onClick={addOption} disabled={!canAddOption} className="bg-gray-200 px-3 py-1 rounded disabled:opacity-50">
              Agregar opcion
            </button>
          </div>
        </div>

        {state.options.map((option, index) => (
          <div key={option.label} className="border rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold w-6">{option.label}</span>
              <input
                value={option.text}
                onChange={(event) => updateOption(index, { text: event.target.value })}
                className="flex-1 border rounded-lg px-3 py-2"
                placeholder={`Texto opcion ${option.label}`}
              />
            </div>

            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOptionImage(event, index)}
              className="border border-dashed rounded-lg p-3 text-sm text-gray-600"
            >
              Arrastra imagen para la opcion {option.label} o selecciona archivo.
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setOptionImageFile(index, event.target.files?.[0])}
                className="block mt-2"
              />
            </div>

            {(option.newImagePreview || option.image?.url) ? (
              <img
                src={option.newImagePreview || option.image?.url}
                alt={`opcion-${option.label}`}
                className="h-20 w-32 object-cover rounded border"
              />
            ) : null}
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium mb-1">Respuesta correcta</label>
          <select
            value={state.correctAnswer}
            onChange={(event) => setField('correctAnswer', event.target.value)}
            className="w-full border rounded-lg px-3 py-2"
          >
            {state.options.map((option) => (
              <option key={option.label} value={option.label}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="bg-[#0A2E57] text-white px-5 py-2 rounded-lg disabled:opacity-60">
          {submitting ? 'Guardando...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-800 px-5 py-2 rounded-lg">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default QuestionEditorForm;
