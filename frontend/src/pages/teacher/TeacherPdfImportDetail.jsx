import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  pdfImportConfirm,
  pdfImportGet,
  pdfImportUpdatePreview
} from '../../services/api';

const POLL_MS = Number(import.meta.env.VITE_PDF_IMPORT_POLL_MS || 2500);
const TERMINAL_STATUS = new Set(['previewReady', 'failed', 'confirmed']);

const statusColor = {
  uploaded: 'bg-slate-100 text-slate-700',
  extracting: 'bg-blue-100 text-blue-700',
  parsing: 'bg-amber-100 text-amber-700',
  previewReady: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
};

const normalizeQuestion = (question) => ({
  ...question,
  selected: true,
  options: (question.options || []).map((option) => ({
    label: option.label,
    text: option.text || ''
  }))
});

function TeacherPdfImportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pollingRef = useRef(null);
  const [job, setJob] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await pdfImportGet(id);
    const nextJob = response.data || null;
    setJob(nextJob);
    if (nextJob?.preview?.questions) {
      setQuestions(nextJob.preview.questions.map(normalizeQuestion));
    }
    return nextJob;
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await load();
        if (data && !TERMINAL_STATUS.has(data.status)) {
          pollingRef.current = window.setInterval(async () => {
            try {
              const polled = await load();
              if (TERMINAL_STATUS.has(polled?.status)) {
                window.clearInterval(pollingRef.current);
              }
            } catch (_error) {
              window.clearInterval(pollingRef.current);
            }
          }, POLL_MS);
        }
      } catch (err) {
        setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo cargar el job');
      } finally {
        setLoading(false);
      }
    };

    run();
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [id]);

  const canEdit = useMemo(() => job?.status === 'previewReady', [job?.status]);

  const updateQuestionField = (idx, field, value) => {
    setQuestions((prev) => prev.map((row, index) => (index === idx ? { ...row, [field]: value } : row)));
  };

  const updateOption = (qIndex, label, text) => {
    setQuestions((prev) => prev.map((row, index) => {
      if (index !== qIndex) return row;
      return {
        ...row,
        options: (row.options || []).map((opt) => (opt.label === label ? { ...opt, text } : opt))
      };
    }));
  };

  const savePreview = async () => {
    try {
      setSaving(true);
      setError('');
      const payload = {
        questions: questions.map((item) => ({
          qNumber: item.qNumber,
          statement: item.statement,
          imageUrls: item.imageUrls || [],
          imageDescription: item.imageDescription || null,
          options: item.options,
          detectedAnswer: item.detectedAnswer || null,
          explanation: item.explanation || '',
          area: item.area || '',
          competencia: item.competencia || '',
          nivelCognitivo: item.nivelCognitivo || '',
          dificultadCualitativa: item.dificultadCualitativa || '',
          tri: item.tri || {},
          confidence: item.confidence || 0,
          flags: item.flags || []
        }))
      };
      const response = await pdfImportUpdatePreview(id, payload);
      setJob(response.data);
      setToast('Preview guardado');
      window.setTimeout(() => setToast(''), 1500);
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const confirmImport = async () => {
    try {
      setConfirming(true);
      setError('');
      const selectedQuestionNumbers = questions
        .filter((item) => item.selected)
        .map((item) => Number(item.qNumber));
      const response = await pdfImportConfirm(id, { selectedQuestionNumbers });
      const created = response.data?.summary?.created || 0;
      setToast(`Importacion completada: ${created} preguntas`);
      window.setTimeout(() => navigate('/dashboard/docente/preguntas'), 900);
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo confirmar');
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <div className="rounded-xl bg-white p-4 shadow">Cargando...</div>;
  if (!job) return <div className="rounded-xl bg-red-50 p-4 text-red-700">Job no encontrado</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#0A2E57]">Importacion PDF #{job._id}</h1>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColor[job.status] || 'bg-slate-100 text-slate-700'}`}>
            {job.status}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {job.source?.originalName} | paginas: {job.pages || 0} | OCR: {job.ocrEngine || '-'}
        </p>
        {job.errors?.length ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {job.errors.map((item, index) => <p key={`${item.type}-${index}`}>{item.type}: {item.message}</p>)}
          </div>
        ) : null}
      </div>

      {toast ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">{toast}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

      {!canEdit ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">
          Procesamiento en curso. Esta vista se actualiza automaticamente cada {POLL_MS} ms hasta quedar lista.
        </div>
      ) : null}

      {canEdit && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={savePreview}
              disabled={saving}
              className="rounded-xl bg-[#0A2E57] px-4 py-2 text-white disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={confirmImport}
              disabled={confirming}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
            >
              {confirming ? 'Importando...' : 'Confirmar e importar al banco'}
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={`${q.qNumber}-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={q.selected}
                      onChange={(event) => updateQuestionField(idx, 'selected', event.target.checked)}
                    />
                    <p className="font-semibold text-slate-800">Pregunta {q.qNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(q.flags || []).map((flag) => (
                      <span key={flag} className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                        {flag}
                      </span>
                    ))}
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      conf {Number(q.confidence || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                <textarea
                  rows={3}
                  value={q.statement || ''}
                  onChange={(event) => updateQuestionField(idx, 'statement', event.target.value)}
                  className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2"
                />

                {/* Mostrar imágenes extraídas del PDF */}
                {Array.isArray(q.imageUrls) && q.imageUrls.length > 0 && (
                  <div className="mb-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase">Imágenes de la pregunta</p>
                    <div className="flex flex-wrap gap-2">
                      {q.imageUrls.map((url, imgIdx) => (
                        <div key={imgIdx} className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                          <img
                            src={url}
                            alt={`Imagen pregunta ${q.qNumber} #${imgIdx + 1}`}
                            className="max-w-full max-h-64 object-contain"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {q.imageDescription && !(Array.isArray(q.imageUrls) && q.imageUrls.length > 0) && (
                  <p className="mb-3 text-sm text-slate-500 italic">[Imagen: {q.imageDescription}]</p>
                )}

                <div className="grid gap-2 md:grid-cols-2">
                  {(q.options || []).map((option) => (
                    <label key={option.label} className="rounded-xl border border-slate-200 p-2 text-sm">
                      <span className="mb-1 block font-semibold text-slate-700">{option.label}</span>
                      <input
                        value={option.text}
                        onChange={(event) => updateOption(idx, option.label, event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-2 py-1"
                      />
                    </label>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <select
                    value={q.detectedAnswer || ''}
                    onChange={(event) => updateQuestionField(idx, 'detectedAnswer', event.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  >
                    <option value="">Sin respuesta</option>
                    {(q.options || []).map((option) => (
                      <option key={option.label} value={option.label}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    value={q.area || ''}
                    placeholder="Area"
                    onChange={(event) => updateQuestionField(idx, 'area', event.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                  <input
                    value={q.competencia || ''}
                    placeholder="Competencia"
                    onChange={(event) => updateQuestionField(idx, 'competencia', event.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2"
                  />
                </div>

                <textarea
                  rows={2}
                  value={q.explanation || ''}
                  onChange={(event) => updateQuestionField(idx, 'explanation', event.target.value)}
                  placeholder="Explicacion"
                  className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default TeacherPdfImportDetail;