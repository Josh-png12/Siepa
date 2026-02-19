import { useEffect, useState } from 'react';
import {
  adminCreatePhysicalTemplate,
  adminDeletePhysicalTemplate,
  adminListPhysicalTemplates,
  adminPatchPhysicalTemplate
} from '../../services/api';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import { adminTokens } from './adminTokens';

function AdminTemplates() {
  const [templates, setTemplates] = useState([]);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('v1');
  const [coordinateJSON, setCoordinateJSON] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [deleteId, setDeleteId] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminListPhysicalTemplates();
      setTemplates(res.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar plantillas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upload = async () => {
    try {
      if (!file) {
        setToast({ type: 'error', message: 'Selecciona un archivo PDF antes de subir.' });
        return;
      }
      setUploading(true);
      const fd = new FormData();
      fd.append('template', file);
      fd.append('name', name || file.name);
      fd.append('version', version);
      fd.append('isActive', 'true');
      fd.append('coordinateJSON', coordinateJSON);
      await adminCreatePhysicalTemplate(fd);
      setFile(null);
      setName('');
      setVersion('v1');
      setCoordinateJSON('{}');
      setToast({ type: 'success', message: 'Plantilla cargada y activada.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'Error subiendo plantilla' });
    } finally {
      setUploading(false);
    }
  };

  const activate = async (id) => {
    try {
      await adminPatchPhysicalTemplate(id, { isActive: true });
      setToast({ type: 'success', message: 'Plantilla activada.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo activar la plantilla.' });
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await adminDeletePhysicalTemplate(deleteId);
      setDeleteId('');
      setToast({ type: 'success', message: 'Plantilla eliminada.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo eliminar la plantilla.' });
    }
  };

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />
      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title="Eliminar plantilla"
        description="Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={remove}
        onCancel={() => setDeleteId('')}
      />

      <div>
        <h1 className={adminTokens.classes.title}>Plantillas OCR</h1>
        <p className={adminTokens.classes.subtitle}>Gestion de plantillas PDF y coordenadas para lectura OMR.</p>
      </div>

      {error ? <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} /> : null}

      <div className={`${adminTokens.classes.card} p-4 space-y-3`}>
        <h2 className={adminTokens.classes.sectionHeader}>Subir plantilla</h2>
        <p className="text-sm text-slate-600">Sube el PDF base y el JSON de coordenadas. Al activar una plantilla, queda como version vigente para la institucion.</p>

        <div className="grid md:grid-cols-2 gap-3">
          <input placeholder="Nombre plantilla" className={adminTokens.classes.input} value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Version" className={adminTokens.classes.input} value={version} onChange={(e) => setVersion(e.target.value)} />
          <label className="border border-dashed border-slate-300 rounded-xl p-3 text-sm text-slate-600 md:col-span-2">
            <span className="font-medium text-slate-800">Archivo PDF</span>
            <input className="block mt-2" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <span className="text-xs">Solo PDF institucional. Tamano recomendado menor a 15MB.</span>
          </label>
          <textarea className={`${adminTokens.classes.input} md:col-span-2`} rows="4" value={coordinateJSON} onChange={(e) => setCoordinateJSON(e.target.value)} placeholder='{"gridOrigin": {"x":20,"y":30}}' />
        </div>

        <button type="button" disabled={uploading} onClick={upload} className={`${adminTokens.classes.buttonPrimary} disabled:opacity-60`}>
          {uploading ? 'Subiendo...' : 'Subir y activar'}
        </button>
      </div>

      <div className={`${adminTokens.classes.card} overflow-auto`}>
        {loading ? (
          <div className="p-4 space-y-2">
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Sin plantillas" description="Sube tu primera plantilla OCR para habilitar simulacros fisicos." />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={adminTokens.classes.tableHead}>
                <th className="p-3">Nombre</th>
                <th className="p-3">Version</th>
                <th className="p-3">Activa</th>
                <th className="p-3">Archivo</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template._id} className="border-t">
                  <td className="p-3">{template.name}</td>
                  <td className="p-3">{template.version}</td>
                  <td className="p-3">
                    <span className={`${adminTokens.classes.badge} ${template.isActive ? adminTokens.colors.successSoft : 'bg-slate-100 text-slate-700'}`}>
                      {template.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="p-3 truncate max-w-[280px]">{template.pdfBasePath}</td>
                  <td className="p-3 space-x-2">
                    <button type="button" onClick={() => activate(template._id)} className="px-2 py-1 rounded bg-blue-600 text-white">Activar</button>
                    <button type="button" onClick={() => setDeleteId(template._id)} className="px-2 py-1 rounded bg-red-600 text-white">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminTemplates;
