import { useEffect, useMemo, useState } from 'react';
import {
  adminApproveQuestion,
  adminListQuestions,
  adminQuestionStatsByArea,
  adminRejectQuestion
} from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import { adminTokens } from './adminTokens';

const TABS = [
  { id: 'pending',  label: 'Pendientes de revision' },
  { id: 'approved', label: 'Banco aprobado' }
];

const tabFilters = {
  pending:  { calibrationStatus: 'experimental', visibility: 'institutional' },
  approved: { calibrationStatus: 'calibrated' }
};

const defaultFilters = {
  q: '',
  area: '',
  page: 1,
  limit: 20
};

function AdminQuestionBank() {
  const [tab, setTab] = useState('pending');
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState({ items: [], pagination: {} });
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminListQuestions({ ...filters, ...tabFilters[tab] });
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

  const loadStats = async () => {
    try {
      const res = await adminQuestionStatsByArea();
      setStats(res.data || []);
      setStatsError('');
    } catch (_err) {
      setStats([]);
      setStatsError('No fue posible cargar estadisticas por area.');
    }
  };

  useEffect(() => {
    load();
  }, [tab, filters.page, filters.limit, filters.area, filters.q]);

  useEffect(() => {
    loadStats();
  }, []);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setFilters(defaultFilters);
  };

  const moderate = async (id, action) => {
    try {
      if (action === 'approve') {
        await adminApproveQuestion(id);
        setToast({ type: 'success', message: 'Pregunta aprobada.' });
      } else {
        await adminRejectQuestion(id);
        setToast({ type: 'success', message: 'Pregunta enviada a borrador.' });
      }
      await load();
      await loadStats();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo actualizar la pregunta.' });
    }
  };

  const pagination = useMemo(() => data.pagination || {}, [data.pagination]);

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <div>
        <h1 className={adminTokens.classes.title}>Banco de Preguntas</h1>
        <p className={adminTokens.classes.subtitle}>Moderacion institucional de calidad y estado de preguntas.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
              tab === t.id
                ? 'bg-white border border-b-white border-slate-200 text-[#0A2E57] -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={`${adminTokens.classes.card} p-4 grid md:grid-cols-3 gap-2`}>
        <input
          placeholder="Buscar por texto, area o competencia"
          className={adminTokens.classes.input}
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, q: e.target.value }))}
        />
        <input
          placeholder="Area"
          className={adminTokens.classes.input}
          value={filters.area}
          onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, area: e.target.value }))}
        />
        <button type="button" className={adminTokens.classes.buttonGhost} onClick={() => setFilters(defaultFilters)}>
          Reset filtros
        </button>
      </div>

      {error ? <ErrorState title="No se pudo cargar" description={error} actionLabel="Reset filtros" onAction={() => setFilters(defaultFilters)} /> : null}

      <section className="grid lg:grid-cols-3 gap-4">
        <div className={`${adminTokens.classes.card} p-4 lg:col-span-2 overflow-auto`}>
          {loading ? (
            <div className="space-y-2">
              <LoadingSkeleton className="h-10" />
              <LoadingSkeleton className="h-10" />
              <LoadingSkeleton className="h-10" />
            </div>
          ) : data.items.length === 0 ? (
            <EmptyState
              title="Sin preguntas para mostrar"
              description={tab === 'pending' ? 'No hay preguntas pendientes de revision.' : 'No hay preguntas aprobadas aun.'}
              actionLabel="Reset filtros"
              onAction={() => setFilters(defaultFilters)}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={adminTokens.classes.tableHead}>
                  <th className="p-3">Enunciado</th>
                  <th className="p-3">Area</th>
                  <th className="p-3">Competencia</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Creador</th>
                  {tab === 'pending' && <th className="p-3">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="p-3">{item.statementText || '-'}</td>
                    <td className="p-3">{item.area || '-'}</td>
                    <td className="p-3">{item.competencia || '-'}</td>
                    <td className="p-3">
                      <span className={`${adminTokens.classes.badge} ${item.estado === 'publicada' ? adminTokens.colors.successSoft : adminTokens.colors.warningSoft}`}>
                        {item.estado || 'borrador'}
                      </span>
                    </td>
                    <td className="p-3">{item.createdBy?.name || item.createdBy?.email || 'N/A'}</td>
                    {tab === 'pending' && (
                      <td className="p-3 space-x-2">
                        <button type="button" onClick={() => moderate(item.id, 'approve')} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">
                          Aprobar
                        </button>
                        <button type="button" onClick={() => moderate(item.id, 'reject')} className="rounded bg-amber-600 px-2 py-1 text-xs text-white">
                          Rechazar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={`${adminTokens.classes.card} p-4`}>
          <h2 className={adminTokens.classes.sectionHeader}>Estadisticas por area</h2>
          {statsError ? (
            <div className="mt-3">
              <EmptyState title="Sin estadisticas" description={statsError} />
            </div>
          ) : stats.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin datos" description="No hay areas registradas aun." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {stats.map((row) => (
                <div key={row.area} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-800">{row.area}</p>
                  <p className="text-slate-600">Total: {row.total}</p>
                  <p className="text-slate-600">Publicadas: {row.publicadas}</p>
                  <p className="text-slate-600">Calibradas: {row.calibradas}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
          className={adminTokens.classes.buttonGhost}
        >
          Anterior
        </button>
        <span className="self-center text-sm">
          {pagination.page || 1}/{pagination.totalPages || 1}
        </span>
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

export default AdminQuestionBank;
