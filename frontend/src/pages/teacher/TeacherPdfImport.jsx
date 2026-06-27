import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pdfImportCreate, pdfImportList } from '../../services/api';

const statusBadge = {
  uploaded: 'bg-slate-100 text-slate-700',
  extracting: 'bg-blue-100 text-blue-700',
  parsing: 'bg-amber-100 text-amber-700',
  previewReady: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
};

function TeacherPdfImport() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [useVision, setUseVision] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const response = await pdfImportList({ status, limit: 30 });
      setJobs(response.data?.items || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [status]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('useVision', useVision);
      const response = await pdfImportCreate(formData);
      const jobId = response.data?._id;
      if (jobId) {
        navigate(`/dashboard/docente/pdf-import/${jobId}`);
      } else {
        await load();
      }
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo subir el PDF');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-[#0A2E57] to-[#16467d] p-6 text-white shadow-xl">
        <h1 className="text-3xl font-bold">Importar PDF al Banco</h1>
        <p className="mt-1 text-blue-100">Sube un PDF, revisa el preview y confirma la importacion.</p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2"
        >
          <option value="">Todos los estados</option>
          <option value="uploaded">uploaded</option>
          <option value="extracting">extracting</option>
          <option value="parsing">parsing</option>
          <option value="previewReady">previewReady</option>
          <option value="confirmed">confirmed</option>
          <option value="failed">failed</option>
        </select>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 hover:bg-violet-100">
          <input
            type="checkbox"
            checked={useVision}
            onChange={(e) => setUseVision(e.target.checked)}
            className="h-4 w-4 accent-violet-600"
          />
          <span className="whitespace-nowrap font-medium">Usar vision IA (DeepSeek-VL)</span>
        </label>

        <label className="cursor-pointer rounded-xl bg-[#0A2E57] px-4 py-2 text-center text-white hover:bg-[#123e71]">
          {uploading ? 'Subiendo...' : 'Subir PDF'}
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>

        <button
          type="button"
          className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
          onClick={load}
        >
          Recargar
        </button>
      </div>

      {useVision && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
          Modo vision IA activo. Recomendado para PDFs con graficas e imagenes. Las preguntas se extraen con DeepSeek-VL2; debes completar la respuesta correcta en la vista de revision.
        </div>
      )}

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

      <div className="grid gap-4">
        {loading ? <div className="rounded-xl bg-white p-4 shadow">Cargando jobs...</div> : null}
        {!loading && jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
            Sin importaciones registradas.
          </div>
        ) : null}
        {!loading && jobs.map((job) => (
          <button
            type="button"
            key={job._id}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            onClick={() => navigate(`/dashboard/docente/pdf-import/${job._id}`)}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">{job.source?.originalName || 'source.pdf'}</p>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge[job.status] || 'bg-slate-100 text-slate-700'}`}>
                {job.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {job.pages || 0} paginas | OCR: {job.ocrEngine || 'pendiente'} | {new Date(job.createdAt).toLocaleString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default TeacherPdfImport;