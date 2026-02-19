import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  adminPdfImportConfirm,
  adminPdfImportGet,
  adminPdfImportUpdatePreview
} from '../../services/api';
import { adminTokens } from './adminTokens';

const POLL_MS = Number(import.meta.env.VITE_PDF_IMPORT_POLL_MS || 2500);
const TERMINAL = new Set(['previewReady', 'failed', 'confirmed']);

function AdminPdfImportDetail() {
  const { id } = useParams();
  const pollRef = useRef(null);
  const [job, setJob] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await adminPdfImportGet(id);
    const nextJob = response.data;
    setJob(nextJob);
    setQuestions((nextJob?.preview?.questions || []).map((item) => ({ ...item, selected: true })));
    return nextJob;
  };

  useEffect(() => {
    const run = async () => {
      try {
        const first = await load();
        if (!TERMINAL.has(first?.status)) {
          pollRef.current = window.setInterval(async () => {
            const next = await load();
            if (TERMINAL.has(next?.status) && pollRef.current) {
              window.clearInterval(pollRef.current);
            }
          }, POLL_MS);
        }
      } catch (err) {
        setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo cargar');
      }
    };
    run();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [id]);

  const save = async () => {
    try {
      setBusy(true);
      setError('');
      const payload = { questions: questions.map(({ selected, ...rest }) => rest) };
      const response = await adminPdfImportUpdatePreview(id, payload);
      setJob(response.data);
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    try {
      setBusy(true);
      setError('');
      const selectedQuestionNumbers = questions.filter((q) => q.selected).map((q) => q.qNumber);
      await adminPdfImportConfirm(id, { selectedQuestionNumbers });
      await load();
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo confirmar');
    } finally {
      setBusy(false);
    }
  };

  if (!job) return <div className="rounded-lg bg-white p-4">Cargando...</div>;

  return (
    <div className={adminTokens.classes.page}>
      <div>
        <h1 className={adminTokens.classes.title}>Importacion PDF #{job._id}</h1>
        <p className={adminTokens.classes.subtitle}>{job.status} | {job.source?.originalName}</p>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      {job.status === 'previewReady' ? (
        <div className="flex gap-2">
          <button type="button" className={adminTokens.classes.buttonPrimary} onClick={save} disabled={busy}>Guardar</button>
          <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-white" onClick={confirm} disabled={busy}>Confirmar</button>
        </div>
      ) : null}
      <div className={`${adminTokens.classes.card} p-4 space-y-3`}>
        {(questions || []).map((q, index) => (
          <div key={`${q.qNumber}-${index}`} className="rounded-lg border p-3">
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={q.selected}
                onChange={(event) => setQuestions((prev) => prev.map((item, idx) => (idx === index ? { ...item, selected: event.target.checked } : item)))}
              />
              <span className="font-semibold">Pregunta {q.qNumber}</span>
            </label>
            <textarea
              rows={2}
              value={q.statement || ''}
              className="w-full rounded border px-2 py-1"
              onChange={(event) => setQuestions((prev) => prev.map((item, idx) => (idx === index ? { ...item, statement: event.target.value } : item)))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminPdfImportDetail;
