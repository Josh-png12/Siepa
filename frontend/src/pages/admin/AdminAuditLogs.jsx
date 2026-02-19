import { useEffect, useMemo, useState } from 'react';
import { adminGetAuditLogs } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import { adminTokens } from './adminTokens';

const defaultFilters = {
  action: '',
  entityType: '',
  page: 1,
  limit: 30
};

function AdminAuditLogs() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminGetAuditLogs(filters);
      setRows(res.data?.items || []);
      setPagination(res.data?.pagination || { page: 1, totalPages: 1 });
      setError('');
    } catch (err) {
      if (err.response?.status === 400) {
        setFilters(defaultFilters);
      }
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.action, filters.entityType, filters.page, filters.limit]);

  const hasFilters = useMemo(() => Boolean(filters.action || filters.entityType), [filters.action, filters.entityType]);

  return (
    <div className={adminTokens.classes.page}>
      <div>
        <h1 className={adminTokens.classes.title}>Auditoria</h1>
        <p className={adminTokens.classes.subtitle}>Trazabilidad de acciones administrativas y cumplimiento institucional.</p>
      </div>

      <div className={`${adminTokens.classes.card} p-3 flex flex-wrap gap-2`}>
        <input
          placeholder="Accion"
          className={adminTokens.classes.input}
          value={filters.action}
          onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, action: e.target.value }))}
        />
        <input
          placeholder="Entidad"
          className={adminTokens.classes.input}
          value={filters.entityType}
          onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, entityType: e.target.value }))}
        />
        <button type="button" className={adminTokens.classes.buttonGhost} onClick={() => setFilters(defaultFilters)}>Limpiar filtros</button>
      </div>

      {error ? <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} /> : null}

      <div className={`${adminTokens.classes.card} overflow-auto`}>
        {loading ? (
          <div className="p-4 space-y-2">
            <LoadingSkeleton className="h-8" />
            <LoadingSkeleton className="h-8" />
            <LoadingSkeleton className="h-8" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Sin registros"
              description={hasFilters ? 'No hay resultados para los filtros aplicados.' : 'Aun no se registran acciones de auditoria.'}
              actionLabel={hasFilters ? 'Limpiar filtros' : ''}
              onAction={hasFilters ? () => setFilters(defaultFilters) : undefined}
            />
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className={adminTokens.classes.tableHead}>
                <th className="p-2">Fecha</th>
                <th className="p-2">Usuario</th>
                <th className="p-2">Accion</th>
                <th className="p-2">Entidad</th>
                <th className="p-2">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-t">
                  <td className="p-2">{row.timestamp ? new Date(row.timestamp).toLocaleString('es-CO') : '-'}</td>
                  <td className="p-2">{row.userId?.name || row.userId?.email || 'N/A'}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2">{row.entityType}</td>
                  <td className="p-2">{row.entityId}</td>
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

export default AdminAuditLogs;
