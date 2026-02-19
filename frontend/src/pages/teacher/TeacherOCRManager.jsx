import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import OCRReviewModal from '../../components/physical/OCRReviewModal.jsx';
import OCRTable from '../../components/physical/OCRTable.jsx';
import UploadArea from '../../components/physical/UploadArea.jsx';
import {
  getTeacherOCRSimulacroDetail,
  publishTeacherOCRResults,
  reviewTeacherOCRSheet,
  uploadTeacherOCRScans
} from '../../services/api';

function TeacherOCRManager() {
  const { simulacroId } = useParams();

  const [summary, setSummary] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getTeacherOCRSimulacroDetail(simulacroId);
      setSummary(response.summary || null);
      setSheets(response.sheets || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar gestion OCR');
    } finally {
      setLoading(false);
    }
  }, [simulacroId]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingReview = useMemo(
    () => sheets.filter((sheet) => (sheet.errors || 0) > 0 || sheet.status === 'needs_review'),
    [sheets]
  );

  const handleUpload = async (files) => {
    if (!files?.length) return;

    try {
      setWorking(true);
      setError('');
      setSuccess('');
      setUploadProgress(0);

      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await uploadTeacherOCRScans(simulacroId, formData, (progress) => {
        const total = progress.total || 1;
        const percent = Math.round((progress.loaded / total) * 100);
        setUploadProgress(percent);
      });

      setSheets(response.sheets || []);
      setSuccess('Hojas escaneadas subidas correctamente.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir hojas escaneadas');
    } finally {
      setWorking(false);
    }
  };

  const openReview = (sheet) => {
    setSelectedSheet(sheet);
    setReviewModalOpen(true);
  };

  const saveReview = async (payload) => {
    try {
      setWorking(true);
      setError('');
      setSuccess('');

      await reviewTeacherOCRSheet(simulacroId, payload);
      setSuccess('Correcciones guardadas correctamente.');
      setReviewModalOpen(false);
      setSelectedSheet(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar correccion');
    } finally {
      setWorking(false);
    }
  };

  const publish = async () => {
    const confirmed = window.confirm('Confirmar y publicar resultados OCR para estudiantes?');
    if (!confirmed) return;

    try {
      setWorking(true);
      setError('');
      setSuccess('');
      await publishTeacherOCRResults(simulacroId, {
        totalSheets: summary?.sheetsReceived || sheets.length,
        invalidSheets: summary?.sheetsWithErrors || pendingReview.length
      });
      setSuccess('Resultados publicados correctamente.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar resultados');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="bg-white rounded-2xl shadow p-6">Cargando gestion OCR...</div>;

  return (
    <div className="space-y-6">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg">{success}</div> : null}

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Simulacro Info Summary</h2>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <div><span className="font-semibold">Titulo:</span> {summary?.title || '-'}</div>
          <div><span className="font-semibold">Fecha:</span> {summary?.date ? new Date(summary.date).toLocaleDateString() : '-'}</div>
          <div><span className="font-semibold">Curso:</span> {summary?.course || '-'}</div>
          <div><span className="font-semibold">Students expected:</span> {summary?.studentsExpected ?? 0}</div>
          <div><span className="font-semibold">Sheets received:</span> {summary?.sheetsReceived ?? sheets.length}</div>
          <div><span className="font-semibold">Sheets with errors:</span> {summary?.sheetsWithErrors ?? pendingReview.length}</div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Upload Mass PDF</h2>

        <UploadArea
          label="Arrastra PDF(s) de hojas escaneadas o haz click"
          accept=".pdf"
          multiple
          disabled={working}
          onFilesSelected={handleUpload}
        />

        <button
          type="button"
          disabled={working}
          className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60"
        >
          Subir Hojas Escaneadas
        </button>

        <div>
          <p className="text-xs text-gray-600 mb-1">Progreso: {uploadProgress}%</p>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-blue-600" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>

        <OCRTable rows={sheets} onReview={openReview} />
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Review Table</h2>
        <OCRTable rows={pendingReview} onReview={openReview} />
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Publish Results</h2>
        <div className="bg-gray-50 border rounded-lg p-3 text-sm">
          <p>Total scanned: {summary?.sheetsReceived ?? sheets.length}</p>
          <p>Total pending: {Math.max(0, (summary?.studentsExpected || 0) - (summary?.sheetsReceived ?? sheets.length))}</p>
          <p>Invalid sheets: {summary?.sheetsWithErrors ?? pendingReview.length}</p>
        </div>
        <button
          type="button"
          onClick={publish}
          disabled={working}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-60"
        >
          Confirmar y Publicar Resultados
        </button>
      </section>

      <OCRReviewModal
        open={reviewModalOpen}
        sheet={selectedSheet}
        saving={working}
        onClose={() => {
          if (working) return;
          setReviewModalOpen(false);
          setSelectedSheet(null);
        }}
        onSave={saveReview}
      />
    </div>
  );
}

export default TeacherOCRManager;
