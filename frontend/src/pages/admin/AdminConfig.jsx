import { useEffect, useState } from 'react';
import { adminGetConfig, adminPatchConfig } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import { adminTokens } from './adminTokens';

function AdminConfig() {
  const [form, setForm] = useState({
    maxUploadMB: 25,
    ocrReviewWindowDays: 14,
    fileRetentionDays: 14,
    featuresEnabled: {
      physicalSimulacrosGlobal: true,
      ocrGlobal: true,
      questionModeration: true
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminGetConfig();
      if (res.data) {
        setForm(res.data);
      }
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la configuracion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const payload = {
        maxUploadMB: Number(form.maxUploadMB),
        ocrReviewWindowDays: Number(form.ocrReviewWindowDays),
        fileRetentionDays: Number(form.fileRetentionDays),
        featuresEnabled: {
          physicalSimulacrosGlobal: Boolean(form.featuresEnabled?.physicalSimulacrosGlobal),
          ocrGlobal: Boolean(form.featuresEnabled?.ocrGlobal),
          questionModeration: Boolean(form.featuresEnabled?.questionModeration)
        }
      };

      await adminPatchConfig(payload);
      setToast({ type: 'success', message: 'Configuracion actualizada.' });
      setError('');
    } catch (err) {
      const details = err.response?.data?.errors;
      const fallback = err.response?.data?.message || 'No se pudo guardar';
      setError(Array.isArray(details) && details.length ? details.join(' | ') : fallback);
      setToast({ type: 'error', message: fallback });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={adminTokens.classes.page}>
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className={`${adminTokens.classes.page} max-w-2xl`}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <div>
        <h1 className={adminTokens.classes.title}>Configuracion</h1>
        <p className={adminTokens.classes.subtitle}>Parametros globales de OCR, retencion y politicas institucionales.</p>
      </div>

      {error ? <ErrorState title="No se pudo procesar" description={error} actionLabel="Reintentar" onAction={load} /> : null}

      <div className={`${adminTokens.classes.card} p-4 space-y-3`}>
        <label className="block text-sm">
          Tamaño máximo de archivo (MB)
          <input type="number" className={`mt-1 w-full ${adminTokens.classes.input}`} value={form.maxUploadMB} onChange={(e) => setForm((prev) => ({ ...prev, maxUploadMB: Number(e.target.value) }))} />
        </label>
        <label className="block text-sm">
          Días de revisión OCR
          <input type="number" className={`mt-1 w-full ${adminTokens.classes.input}`} value={form.ocrReviewWindowDays} onChange={(e) => setForm((prev) => ({ ...prev, ocrReviewWindowDays: Number(e.target.value) }))} />
        </label>
        <label className="block text-sm">
          Días de retención de archivos
          <input type="number" className={`mt-1 w-full ${adminTokens.classes.input}`} value={form.fileRetentionDays} onChange={(e) => setForm((prev) => ({ ...prev, fileRetentionDays: Number(e.target.value) }))} />
        </label>

        <div className="space-y-2">
          <Toggle
            label="Simulacros físicos (global)"
            value={form.featuresEnabled?.physicalSimulacrosGlobal}
            onChange={(value) => setForm((prev) => ({ ...prev, featuresEnabled: { ...prev.featuresEnabled, physicalSimulacrosGlobal: value } }))}
          />
          <Toggle
            label="Lectura automática (global)"
            value={form.featuresEnabled?.ocrGlobal}
            onChange={(value) => setForm((prev) => ({ ...prev, featuresEnabled: { ...prev.featuresEnabled, ocrGlobal: value } }))}
          />
          <Toggle
            label="Moderación de preguntas"
            value={form.featuresEnabled?.questionModeration}
            onChange={(value) => setForm((prev) => ({ ...prev, featuresEnabled: { ...prev.featuresEnabled, questionModeration: value } }))}
          />
        </div>
        <button type="button" disabled={saving} onClick={save} className={`${adminTokens.classes.buttonPrimary} disabled:opacity-60`}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default AdminConfig;
