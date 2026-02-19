import { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { studentGetOverview } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import StatusBadge from '../../components/ui/StatusBadge';
import { studentTokens } from './studentTokens';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function StudentHome() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await studentGetOverview();
        setData(response.data || null);
        setError('');
      } catch (err) {
        const details = err.response?.data?.errors;
        setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar tu inicio');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const weeklyChart = useMemo(() => {
    const series = data?.weeklyProgress || [];
    return {
      labels: series.map((item) => new Date(item.date).toLocaleDateString('es-CO', { weekday: 'short' })),
      datasets: [
        {
          label: 'Theta semanal',
          data: series.map((item) => item.theta),
          borderColor: '#00A3E0',
          backgroundColor: 'rgba(0,163,224,0.2)',
          tension: 0.35,
          spanGaps: true
        }
      ]
    };
  }, [data]);

  if (loading) {
    return (
      <div className={studentTokens.classes.page}>
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} />;
  }

  return (
    <div className={studentTokens.classes.page}>
      <div>
        <h1 className={studentTokens.classes.title}>Inicio</h1>
        <p className={studentTokens.classes.subtitle}>Vas bien. Aqui tienes tu panorama academico del dia.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Kpi title="Theta actual" value={Number(data?.kpis?.thetaActual || 0).toFixed(2)} />
        <Kpi title="Score global" value={data?.kpis?.scoreGlobal || 0} />
        <Kpi title="Percentil" value={data?.kpis?.percentil || 0} />
        <Kpi title="Completados" value={data?.kpis?.simulacrosCompletados || 0} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className={`${studentTokens.classes.card} p-4 lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F2D52]">Progreso semanal</h2>
            <StatusBadge
              label={data?.kpis?.trend?.label || 'estable'}
              tone={data?.kpis?.trend?.delta > 0 ? 'ok' : data?.kpis?.trend?.delta < 0 ? 'warning' : 'info'}
            />
          </div>
          {(data?.weeklyProgress || []).length ? (
            <div className="mt-3 h-56">
              <Line
                data={weeklyChart}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState title="Sin progreso semanal" description="Aun no hay actividad para esta semana." />
            </div>
          )}
        </article>

        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Siguiente objetivo</h2>
          <p className="mt-3 text-sm font-medium text-slate-700">{data?.objective?.title || 'Sigue practicando'}</p>
          <p className="mt-2 text-sm text-slate-600">{data?.objective?.description || 'Completa un simulacro para recomendaciones personalizadas.'}</p>
          {data?.objective?.area ? (
            <p className="mt-2 text-xs text-slate-500">Area foco: {data.objective.area}</p>
          ) : null}
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Proximo simulacro</h2>
          {!data?.nextSimulacro ? (
            <div className="mt-3">
              <EmptyState title="Sin simulacros disponibles" description="Tu docente aun no ha publicado un nuevo simulacro." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="font-semibold text-slate-800">{data.nextSimulacro.title}</p>
              <p className="text-sm text-slate-600">{data.nextSimulacro.description || 'Listo para iniciar cuando quieras.'}</p>
              <p className="text-xs text-slate-500">
                {data.nextSimulacro.questionCount} preguntas {data.nextSimulacro.duration ? `• ${data.nextSimulacro.duration} min` : ''}
              </p>
              <button
                type="button"
                onClick={() => navigate('/dashboard/estudiante/simulacros')}
                className={studentTokens.classes.buttonPrimary}
              >
                Ir a simulacros
              </button>
            </div>
          )}
        </article>

        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Resultados recientes</h2>
          {(data?.latestResults || []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin resultados aun" description="Cuando finalices simulacros veras aqui tus ultimos avances." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {data.latestResults.map((item) => (
                <div key={`${item.type}-${item.date}`} className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-800">{item.title}</p>
                  <p className="text-slate-600">{item.type === 'physical' ? 'Fisico' : 'Virtual'} • Score {item.score} • Percentil {item.percentile}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

function Kpi({ title, value }) {
  return (
    <article className={`${studentTokens.classes.card} p-4`}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-[#0F2D52]">{value}</p>
    </article>
  );
}

export default StudentHome;
