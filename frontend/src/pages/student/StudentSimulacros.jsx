import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentGetSimulacros } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import StatusBadge from '../../components/ui/StatusBadge';
import { studentTokens } from './studentTokens';

const tabs = [
  { id: 'available', label: 'Disponibles' },
  { id: 'inProgress', label: 'En curso' },
  { id: 'completed', label: 'Completados' }
];

function StudentSimulacros() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('available');
  const [data, setData] = useState({ items: [], physicalReadOnly: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const response = await studentGetSimulacros({ status: activeTab, page: 1, limit: 30 });
      setData(response.data || { items: [], physicalReadOnly: [], pagination: {} });
      setError('');
    } catch (err) {
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudieron cargar simulacros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeTab]);

  const emptyCopy = useMemo(() => {
    if (activeTab === 'available') return 'No hay simulacros publicados por ahora.';
    if (activeTab === 'inProgress') return 'No tienes simulacros en curso.';
    return 'Aun no tienes simulacros finalizados.';
  }, [activeTab]);

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} />;
  }

  return (
    <div className={studentTokens.classes.page}>
      <div>
        <h1 className={studentTokens.classes.title}>Simulacros</h1>
        <p className={studentTokens.classes.subtitle}>Presenta simulacros virtuales y consulta estado de fisicos en un solo lugar.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? studentTokens.classes.buttonPrimary : studentTokens.classes.buttonGhost}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className={`${studentTokens.classes.card} p-4 lg:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Virtuales</h2>
          {loading ? (
            <div className="mt-3 space-y-2">
              <LoadingSkeleton className="h-12" />
              <LoadingSkeleton className="h-12" />
              <LoadingSkeleton className="h-12" />
            </div>
          ) : (data.items || []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin elementos" description={emptyCopy} />
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {data.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{item.title}</p>
                    <StatusBadge label={activeTab === 'available' ? 'Listo' : activeTab === 'inProgress' ? 'En curso' : 'Finalizado'} tone={activeTab === 'completed' ? 'ok' : 'info'} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.description || 'Sin descripcion'}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.questionCount} preguntas {item.duration ? `• ${item.duration} min` : ''}</p>

                  <div className="mt-3 flex gap-2">
                    {activeTab === 'available' ? (
                      <button type="button" onClick={() => navigate(`/simulacros/${item.id}/take`)} className={studentTokens.classes.buttonPrimary}>
                        Iniciar
                      </button>
                    ) : null}
                    {activeTab === 'inProgress' ? (
                      <button type="button" onClick={() => navigate(`/simulacros/${item.id}/take`)} className={studentTokens.classes.buttonPrimary}>
                        Reanudar
                      </button>
                    ) : null}
                    {activeTab === 'completed' ? (
                      <button type="button" onClick={() => navigate(`/simulacros/${item.id}/results`)} className={studentTokens.classes.buttonGhost}>
                        Ver resultado
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className={`${studentTokens.classes.card} p-4 lg:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Simulacros fisicos (solo lectura)</h2>
          {(data.physicalReadOnly || []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin simulacros fisicos" description="Cuando tu institucion cargue hojas OCR, veras aqui su estado." />
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {data.physicalReadOnly.map((item) => (
                <div key={`${item.source}-${item.id}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{item.title}</p>
                    <StatusBadge
                      label={item.statusLabel}
                      tone={item.statusLabel === 'publicado' ? 'ok' : item.statusLabel === 'en revision' ? 'warning' : 'info'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.questionCount} preguntas • {item.courses?.join(', ') || 'Sin curso'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default StudentSimulacros;
