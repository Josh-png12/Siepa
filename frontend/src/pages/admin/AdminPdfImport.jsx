import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminPdfImportCreate, adminPdfImportList } from '../../services/api';
import { adminTokens } from './adminTokens';

function AdminPdfImport() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const response = await adminPdfImportList({ limit: 30 });
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
  }, []);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const response = await adminPdfImportCreate(formData);
      navigate(`/dashboard/admin/pdf-import/${response.data?._id}`);
    } catch (err) {
      setError(err.response?.data?.errors?.join(' | ') || err.response?.data?.message || 'No se pudo subir el PDF');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className={adminTokens.classes.page}>
      <div>
        <h1 className={adminTokens.classes.title}>Importar PDF</h1>
        <p className={adminTokens.classes.subtitle}>OCR + preview editable para banco institucional.</p>
      </div>

      <div className={`${adminTokens.classes.card} p-4 flex gap-3`}>
        <label className="cursor-pointer rounded-lg bg-[#0A2E57] px-4 py-2 text-white">
          {uploading ? 'Subiendo...' : 'Subir PDF'}
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>
        <button type="button" className={adminTokens.classes.buttonGhost} onClick={load}>Recargar</button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      <div className={`${adminTokens.classes.card} p-4`}>
        {loading ? <p>Cargando...</p> : null}
        {!loading && jobs.length === 0 ? <p className="text-slate-500">Sin jobs registrados.</p> : null}
        {!loading && jobs.map((job) => (
          <button
            type="button"
            key={job._id}
            className="mb-2 w-full rounded-lg border p-3 text-left hover:bg-slate-50"
            onClick={() => navigate(`/dashboard/admin/pdf-import/${job._id}`)}
          >
            <p className="font-semibold">{job.source?.originalName}</p>
            <p className="text-sm text-slate-600">{job.status} | {new Date(job.createdAt).toLocaleString()}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AdminPdfImport;
