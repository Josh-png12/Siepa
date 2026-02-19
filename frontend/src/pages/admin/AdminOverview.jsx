import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adminDownloadInstitutionReport,
  adminGetConfig,
  adminGetGovernanceOCR,
  adminGetInstitutionAnalytics
} from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import Toast from '../../components/ui/Toast';
import { adminTokens } from './adminTokens';

function AdminOverview() {
  const navigate = useNavigate();
  const [governance, setGovernance] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const [g, a, c] = await Promise.all([
        adminGetGovernanceOCR(),
        adminGetInstitutionAnalytics(),
        adminGetConfig()
      ]);
      setGovernance(g.data);
      setAnalytics(a.data);
      setConfig(c.data);
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo cargar' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const downloadReport = async () => {
    try {
      const blob = await adminDownloadInstitutionReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reporte-institucional-siepa.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (_error) {
      setToast({ type: 'error', message: 'No se pudo exportar el reporte' });
    }
  };

  if (loading) {
    return (
      <div className={adminTokens.classes.page}>
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-32" />
        <LoadingSkeleton className="h-72" />
      </div>
    );
  }

  const quickActions = [
    { label: 'Crear usuario', to: '/dashboard/admin/users' },
    { label: 'Crear curso', to: '/dashboard/admin/courses' },
    { label: 'Subir plantilla OCR', to: '/dashboard/admin/templates' },
    { label: 'Ver auditoria', to: '/dashboard/admin/audit' }
  ];

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={adminTokens.classes.title}>Dashboard Administrativo</h1>
          <p className={adminTokens.classes.subtitle}>Vista institucional de operacion, riesgo y gobernanza.</p>
        </div>
        <button type="button" onClick={downloadReport} className={adminTokens.classes.buttonPrimary}>
          Exportar reporte
        </button>
      </div>

      <section className="grid md:grid-cols-5 gap-4">
        <Card title="Hojas esperadas" value={governance?.totals?.expected || 0} />
        <Card title="Hojas recibidas" value={governance?.totals?.received || 0} />
        <Card title="Pendientes OCR" value={governance?.totals?.pending || 0} />
        <Card title="Duplicados" value={governance?.totals?.duplicates || 0} />
        <Card title="Riesgo cognitivo" value={Number(analytics?.metrics?.riskCognitiveIndex || 0).toFixed(4)} />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className={`${adminTokens.classes.card} p-4`}>
          <h2 className={adminTokens.classes.sectionHeader}>Acciones rapidas</h2>
          <div className="mt-3 grid gap-2">
            {quickActions.map((action) => (
              <button key={action.label} type="button" onClick={() => navigate(action.to)} className="text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-sm">
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`${adminTokens.classes.card} p-4 lg:col-span-2`}>
          <h2 className={adminTokens.classes.sectionHeader}>Estado del sistema</h2>
          {!config ? (
            <EmptyState title="Sin configuracion" description="No hay configuracion global registrada." actionLabel="Ir a configuracion" onAction={() => navigate('/dashboard/admin/config')} />
          ) : (
            <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
              <StatusRow label="maxUploadMB" value={config.maxUploadMB} />
              <StatusRow label="ocrReviewWindowDays" value={config.ocrReviewWindowDays} />
              <StatusRow label="fileRetentionDays" value={config.fileRetentionDays} />
              <StatusRow label="OCR Global" value={config?.featuresEnabled?.ocrGlobal ? 'Activo' : 'Inactivo'} />
              <StatusRow label="Physical Global" value={config?.featuresEnabled?.physicalSimulacrosGlobal ? 'Activo' : 'Inactivo'} />
              <StatusRow label="Question Moderation" value={config?.featuresEnabled?.questionModeration ? 'Activa' : 'Inactiva'} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className={`${adminTokens.classes.card} p-4`}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-[#0A2E57]">{value}</p>
    </div>
  );
}

function StatusRow({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default AdminOverview;
