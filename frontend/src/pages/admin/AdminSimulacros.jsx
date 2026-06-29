import { useEffect, useMemo, useState } from 'react';
import {
  adminForceArchiveSimulacro,
  adminListGovernanceSimulacros
} from '../../services/api';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import { adminTokens } from './adminTokens';

const defaultFilters = {
  page: 1,
  limit: 20
};

function AdminSimulacros() {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState({ items: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminListGovernanceSimulacros(filters);
      setData(res.data || { items: [], pagination: {} });
      setError('');
    } catch (err) {
      if (err.response?.status === 400) {
        setFilters(defaultFilters);
        setToast({ type: 'error', message: 'Filtros invalidos. Se restablecieron.' });
      }
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.page, filters.limit]);

  const archive = async () => {
    if (!target?.id) return;
    try {
      await adminForceArchiveSimulacro(target.id, target.type);
      setTarget(null);
      setToast({ type: 'success', message: 'Simulacro archivado.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo archivar el simulacro.' });
    }
  };

  const pagination = useMemo(() => data.pagination || {}, [data.pagination]);

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <ConfirmModal
        isOpen={Boolean(target)}
        title="Archivar simulacro"
        description="Esta accion fuerza el archivado del simulacro seleccionado."
        confirmLabel="Confirmar"
        onConfirm={archive}
        onCancel={() => setTarget(null)}
      />

      <div>
        <h1 className={adminTokens.classes.title}>Simulacros</h1>
        <p className={adminTokens.classes.subtitle}>Gobernanza unificada de simulacros virtuales y fisicos.</p>
      </div>

      {error ? <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} /> : null}

      <div className={`${adminTokens.classes.card} overflow-auto`}>
        {loading ? (
          <div className="p-4 space-y-2">
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Sin simulacros"
              description="No hay simulacros para esta institucion aun."
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={adminTokens.classes.tableHead}>
                <th className="p-3">Tipo</th>
                <th className="p-3">Titulo</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Responsable</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Accion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="border-t">
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.type === 'physical' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'}`}>
                      {item.type === 'physical' ? 'Fisico' : 'Virtual'}
                    </span>
                  </td>
                  <td className="p-3">{item.title}</td>
                  <td className="p-3">
                    <span className={`${adminTokens.classes.badge} ${item.status === 'published' ? adminTokens.colors.successSoft : item.status === 'archived' ? adminTokens.colors.neutralSoft : adminTokens.colors.warningSoft}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3">{item.owner?.name || 'N/A'}</td>
                  <td className="p-3">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('es-CO') : '-'}</td>
                  <td className="p-3">
                    <button type="button" onClick={() => setTarget(item)} className="px-2 py-1 rounded bg-red-600 text-white">
                      Force archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
          className={adminTokens.classes.buttonGhost}
        >
          Anterior
        </button>
        <span className="self-center text-sm">{pagination.page || 1}/{pagination.totalPages || 1}</span>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(pagination.totalPages || 1, (prev.page || 1) + 1) }))}
          className={adminTokens.classes.buttonGhost}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default AdminSimulacros;
