import { useRef, useState } from 'react';
import { createAICaseGroup, createQuestion, generateAIQuestions } from '../../services/api';

const AREAS = [
  {
    label: 'Lectura Crítica',
    value: 'Lectura Crítica',
    db: 'lectura',
    hint: '📄 Siempre incluye un texto base literario o periodístico',
    isEnglish: false,
  },
  {
    label: 'Matemáticas',
    value: 'Matemáticas',
    db: 'matematicas',
    hint: '🔢 Situaciones problema con contexto de la vida colombiana',
    isEnglish: false,
  },
  {
    label: 'Ciencias Naturales',
    value: 'Ciencias Naturales',
    db: 'ciencias',
    hint: '🔬 Puede incluir descripción de experimento o situación ambiental',
    isEnglish: false,
  },
  {
    label: 'Ciencias Sociales',
    value: 'Ciencias Sociales',
    db: 'sociales',
    hint: '📜 Puede incluir fuente histórica, fragmento constitucional o datos sociales',
    isEnglish: false,
  },
  {
    label: 'Inglés',
    value: 'Inglés',
    db: 'ingles',
    hint: '🇬🇧 Siempre incluye texto base en inglés · Preguntas en inglés (B1-B2)',
    isEnglish: true,
  },
];

const DIFICULTADES = [
  { label: 'Fácil (>70% la responde)',   value: 'fácil',   db: 'baja' },
  { label: 'Media (40–70% la responde)', value: 'media',   db: 'media' },
  { label: 'Difícil (<40% la responde)', value: 'difícil', db: 'alta' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const TEMA_PLACEHOLDERS = {
  'Lectura Crítica':    'Ej: Narrativa latinoamericana, crónica sobre el conflicto, ensayo sobre identidad...',
  'Matemáticas':        'Ej: Funciones cuadráticas, estadística descriptiva, geometría plana...',
  'Ciencias Naturales': 'Ej: Fotosíntesis, ecosistemas de la Amazonía, leyes de Newton...',
  'Ciencias Sociales':  'Ej: Constitución de 1991, desigualdad socioeconómica, violencia política...',
  'Inglés':             'Ej: Environmental awareness, job applications, technology in daily life...',
};

const initialForm = {
  area: AREAS[0].value,
  competencia: '',
  dificultad: DIFICULTADES[1].value,
  tema: '',
  fuente: '',
  cantidad: 3,
};

function buildQuestionPayload(question, areaDb, dificultadDb, caseGroupId) {
  const payload = {
    statement: { text: question.enunciado, images: [] },
    latex: '',
    options: OPTION_LABELS.map((label) => ({
      label,
      text: question.opciones?.[label] || '',
      image: null,
    })),
    correctAnswer: question.correcta,
    area: areaDb,
    competencia: question.competencia || '',
    nivelCognitivo: 'analizar',
    dificultadCualitativa: dificultadDb,
    triParams: { a: 1, b: 0, c: 0.2 },
    visibility: 'private',
    calibrationStatus: 'experimental',
    ...(caseGroupId ? { caseGroup: caseGroupId } : {}),
  };
  const fd = new FormData();
  fd.append('payload', JSON.stringify(payload));
  return fd;
}

// ── TextBaseCard ──────────────────────────────────────────────────────────────

function TextBaseCard({ textoBase, isEnglish, fuente }) {
  return (
    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between bg-slate-100 border-b border-slate-200 px-4 py-2.5">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-base">📄</span>
          <span className="text-xs font-semibold uppercase tracking-wider">Texto base</span>
          {isEnglish && (
            <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              EN
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 italic">
          Todas las preguntas se refieren a este texto
        </span>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-2">
        {textoBase.titulo && (
          <p className="font-semibold text-slate-800 text-sm">{textoBase.titulo}</p>
        )}
        <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto font-serif">
          {textoBase.contenido}
        </div>
        {fuente ? (
          <p className="text-right italic text-xs text-gray-500 mt-2 pt-2 border-t border-slate-200">
            {fuente}
          </p>
        ) : null}
      </div>

      {/* Divider with label */}
      <div className="flex items-center gap-3 px-5 pb-3">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wide whitespace-nowrap">
          Preguntas basadas en el texto anterior
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
    </div>
  );
}

// ── QuestionCard ──────────────────────────────────────────────────────────────

function QuestionCard({ question, areaDb, dificultadDb, getCaseGroupId, onAdded }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [cardError, setCardError] = useState('');

  const handleAdd = async () => {
    try {
      setAdding(true);
      setCardError('');
      const caseGroupId = await getCaseGroupId();
      const fd = buildQuestionPayload(question, areaDb, dificultadDb, caseGroupId);
      await createQuestion(fd);
      setAdded(true);
      onAdded();
    } catch (err) {
      setCardError(err.response?.data?.message || err.message || 'No se pudo guardar la pregunta');
    } finally {
      setAdding(false);
    }
  };

  if (added) return null;

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-white shadow-sm">
      <p className="font-medium text-gray-900 leading-relaxed">{question.enunciado}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTION_LABELS.map((label) => {
          const isCorrect = question.correcta === label;
          return (
            <div
              key={label}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
                isCorrect
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold'
                  : 'bg-gray-50 border-gray-200 text-gray-700'
              }`}
            >
              <span className="font-bold w-5 shrink-0">{label}.</span>
              <span className="flex-1">{question.opciones?.[label] || '—'}</span>
              {isCorrect && (
                <span className="ml-auto shrink-0 text-emerald-600 text-xs font-bold">✓</span>
              )}
            </div>
          );
        })}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-[#0A2E57] font-medium select-none">
          Ver explicación pedagógica
        </summary>
        <div className="mt-2 space-y-2 pl-2 border-l-2 border-emerald-200">
          <p className="text-gray-700">
            <span className="font-semibold text-emerald-700">
              Por qué {question.correcta} es correcta:{' '}
            </span>
            {question.explicacion_correcta}
          </p>
          {question.explicacion_distractores && (
            <div className="space-y-1 text-gray-600">
              {OPTION_LABELS.filter((l) => l !== question.correcta).map((label) =>
                question.explicacion_distractores[label] ? (
                  <p key={label}>
                    <span className="font-semibold">{label}: </span>
                    {question.explicacion_distractores[label]}
                  </p>
                ) : null
              )}
            </div>
          )}
        </div>
      </details>

      {cardError && <p className="text-red-600 text-sm">{cardError}</p>}

      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="w-full bg-[#0A2E57] hover:bg-[#0d3b6e] text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
      >
        {adding ? 'Guardando...' : 'Agregar al banco'}
      </button>
    </div>
  );
}

// ── AIGenerateModal ───────────────────────────────────────────────────────────

function AIGenerateModal({ onClose, onQuestionAdded }) {
  const [form, setForm] = useState(initialForm);
  const [generating, setGenerating] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [textoBase, setTextoBase] = useState(null);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(false);

  // Lazily-created CaseGroup ID shared across all question cards in the same batch.
  const caseGroupIdRef = useRef(null);
  const caseGroupCreatingRef = useRef(null);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleGenerate = async () => {
    if (!form.competencia.trim()) {
      setError('Escribe la competencia que quieres evaluar.');
      return;
    }
    try {
      setGenerating(true);
      setError('');
      setQuestions([]);
      setTextoBase(null);
      setGenerated(false);
      caseGroupIdRef.current = null;
      caseGroupCreatingRef.current = null;

      const data = await generateAIQuestions({
        area: form.area,
        competencia: form.competencia.trim(),
        dificultad: form.dificultad,
        tema: form.tema.trim(),
        cantidad: form.cantidad,
      });

      setQuestions(data.questions || []);
      setTextoBase(data.textoBase || null);
      setGenerated(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error al conectar con la IA');
    } finally {
      setGenerating(false);
    }
  };

  // Creates the CaseGroup on the first call, reuses the same ID for siblings.
  const getCaseGroupId = async () => {
    if (!textoBase?.contenido) return null;
    if (caseGroupIdRef.current) return caseGroupIdRef.current;
    if (!caseGroupCreatingRef.current) {
      caseGroupCreatingRef.current = createAICaseGroup({
        titulo: textoBase.titulo || 'Texto base generado por IA',
        contenido: textoBase.contenido,
        fuente: form.fuente.trim() || undefined,
      }).then((res) => {
        caseGroupIdRef.current = res.id;
        return res.id;
      });
    }
    return caseGroupCreatingRef.current;
  };

  const areaEntry = AREAS.find((a) => a.value === form.area) || AREAS[0];
  const difEntry = DIFICULTADES.find((d) => d.value === form.dificultad) || DIFICULTADES[1];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-xl font-bold text-[#0A2E57] flex items-center gap-2">
            <span>✨</span> Generar preguntas con IA
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Form */}
          <div className="grid sm:grid-cols-2 gap-4">

            <div>
              <label className="block text-sm font-medium mb-1">Área ICFES</label>
              <select
                value={form.area}
                onChange={(e) => setField('area', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {AREAS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              {areaEntry.hint && (
                <p className="text-xs text-slate-500 mt-1">{areaEntry.hint}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Dificultad</label>
              <select
                value={form.dificultad}
                onChange={(e) => setField('dificultad', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {DIFICULTADES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Competencia <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.competencia}
                onChange={(e) => setField('competencia', e.target.value)}
                placeholder="Ej: Interpretación textual, Pensamiento variacional, Indagación..."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Tema / contexto{' '}
                <span className="text-gray-400 font-normal">(opcional, pero mejora la calidad)</span>
              </label>
              <textarea
                value={form.tema}
                onChange={(e) => setField('tema', e.target.value)}
                rows={2}
                placeholder={TEMA_PLACEHOLDERS[form.area] || 'Escribe el tema específico...'}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                Fuente (opcional)
              </label>
              <input
                type="text"
                value={form.fuente}
                onChange={(e) => setField('fuente', e.target.value)}
                placeholder="Ej: Tomado y adaptado de: Autor, A. (Año). Título. Ciudad: Editorial."
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">
                Se mostrará al pie del texto base que leerá el estudiante.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Cantidad (1–10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={form.cantidad}
                onChange={(e) =>
                  setField('cantidad', Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))
                }
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>

          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={handleGenerate}
                className="shrink-0 underline font-medium hover:text-red-900"
              >
                Reintentar
              </button>
            </div>
          )}

          {/* Spinner */}
          {generating && (
            <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
              <svg className="animate-spin h-8 w-8 text-[#0A2E57]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm">Generando preguntas con IA...</p>
            </div>
          )}

          {/* Results */}
          {generated && !generating && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                {questions.length > 0
                  ? `${questions.length} pregunta${questions.length !== 1 ? 's' : ''} generada${questions.length !== 1 ? 's' : ''}. Revísalas y agrega las que quieras al banco.`
                  : 'La IA no devolvió preguntas. Intenta con parámetros diferentes.'}
              </p>

              {/* Texto base card (covers the whole batch) */}
              {textoBase?.contenido && (
                <TextBaseCard textoBase={textoBase} isEnglish={areaEntry.isEnglish} fuente={form.fuente.trim()} />
              )}

              {/* Question cards */}
              {questions.map((q, idx) => (
                <QuestionCard
                  key={idx}
                  question={q}
                  areaDb={areaEntry.db}
                  dificultadDb={difEntry.db}
                  getCaseGroupId={getCaseGroupId}
                  onAdded={onQuestionAdded}
                />
              ))}
            </div>
          )}

          {/* Generate / regenerate button */}
          {!generating && (
            <button
              type="button"
              onClick={handleGenerate}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span>✨</span>
              {generated ? 'Generar nuevas preguntas' : 'Generar'}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

export default AIGenerateModal;
