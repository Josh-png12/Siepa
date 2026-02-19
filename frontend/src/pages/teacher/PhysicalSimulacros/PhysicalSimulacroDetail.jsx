import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  generatePhysicalSimulacroPdfs,
  getPhysicalReviewStats,
  getPhysicalSimulacro,
  publishPhysicalResults,
  processPhysicalScan
} from '../../../services/api';
import OmrScanForm from '../../../components/physical/OmrScanForm.jsx';
import PhysicalStatsCards from '../../../components/physical/PhysicalStatsCards.jsx';

function PhysicalSimulacroDetail() {
  const { id } = useParams();

  const [simulacro, setSimulacro] = useState(null);
  const [stats, setStats] = useState(null);
  const [scanFile, setScanFile] = useState(null);
  const [qrPayload, setQrPayload] = useState('');
  const [bubbleDetections, setBubbleDetections] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [sim, review] = await Promise.all([
        getPhysicalSimulacro(id),
        getPhysicalReviewStats(id)
      ]);
      setSimulacro(sim.simulacro);
      setStats(review.stats);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar simulacro fisico');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const generatePdfs = async () => {
    try {
      setWorking(true);
      setError('');
      setSuccess('');
      await generatePhysicalSimulacroPdfs(id);
      setSuccess('PDFs generados correctamente.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron generar PDFs');
    } finally {
      setWorking(false);
    }
  };

  const submitScan = async (event) => {
    event.preventDefault();

    try {
      setWorking(true);
      setError('');
      setSuccess('');

      const formData = new FormData();
      if (scanFile) formData.append('scanFile', scanFile);
      formData.append('qrPayload', qrPayload);
      formData.append('bubbleDetections', bubbleDetections);
      formData.append('dpi', '300');
      formData.append('format', 'bw');

      await processPhysicalScan(id, formData);
      setSuccess('Escaneo procesado correctamente.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo procesar escaneo OMR');
    } finally {
      setWorking(false);
    }
  };

  const publish = async () => {
    const confirmed = window.confirm('Confirmar y publicar resultados?');
    if (!confirmed) return;

    try {
      setWorking(true);
      setError('');
      setSuccess('');
      await publishPhysicalResults(id);
      setSuccess('Resultados publicados correctamente.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar resultados');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="bg-white rounded-2xl shadow p-6">Cargando...</div>;

  return (
    <div className="space-y-6">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg">{success}</div> : null}

      <section className="bg-white rounded-2xl shadow p-5 grid md:grid-cols-3 gap-3">
        <div><span className="font-semibold">ID:</span> {simulacro?.simulacroPhysicalId}</div>
        <div><span className="font-semibold">Titulo:</span> {simulacro?.title}</div>
        <div><span className="font-semibold">Estado:</span> {simulacro?.status}</div>
        <div><span className="font-semibold">Preguntas:</span> {simulacro?.questionCount}</div>
        <div><span className="font-semibold">Cursos:</span> {(simulacro?.assignedCourses || []).map((course) => course.name).join(', ')}</div>
        <div><span className="font-semibold">Template:</span> {simulacro?.baseTemplatePath || 'default'}</div>
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Paso 2-3: Generacion de PDF Examen + OMR</h2>
        <button type="button" onClick={generatePdfs} disabled={working} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
          {working ? 'Procesando...' : 'Generar PDFs'}
        </button>
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Paso 4: Escaneo OMR (scanner-only)</h2>
        <OmrScanForm
          scanFile={scanFile}
          qrPayload={qrPayload}
          bubbleDetections={bubbleDetections}
          working={working}
          onScanFileChange={setScanFile}
          onQrPayloadChange={setQrPayload}
          onBubbleDetectionsChange={setBubbleDetections}
          onSubmit={submitScan}
        />
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Paso 6: Publicacion de resultados</h2>
        <PhysicalStatsCards stats={stats} />

        <button type="button" onClick={publish} disabled={working} className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-60">
          Confirm and Publish Results
        </button>
      </section>
    </div>
  );
}

export default PhysicalSimulacroDetail;
