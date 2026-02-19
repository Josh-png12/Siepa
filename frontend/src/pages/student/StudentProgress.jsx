import { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, BarElement } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { studentGetProgress } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import StatusBadge from '../../components/ui/StatusBadge';
import { studentTokens } from './studentTokens';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, BarElement);

function StudentProgress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const response = await studentGetProgress();
      setData(response.data || null);
      setError('');
    } catch (err) {
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar tu progreso');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const thetaChart = useMemo(() => ({
    labels: (data?.thetaSeries || []).map((item) => new Date(item.date).toLocaleDateString('es-CO')),
    datasets: [
      {
        label: 'Theta',
        data: (data?.thetaSeries || []).map((item) => item.theta),
        borderColor: '#0F2D52',
        backgroundColor: 'rgba(15,45,82,0.2)',
        tension: 0.35
      }
    ]
  }), [data]);

  const competencyChart = useMemo(() => ({
    labels: (data?.competencies || []).map((item) => item.area),
    datasets: [
      {
        label: 'Puntaje 0-100',
        data: (data?.competencies || []).map((item) => item.score0_100),
        backgroundColor: '#00A3E0'
      }
    ]
  }), [data]);

  if (loading) {
    return (
      <div className={studentTokens.classes.page}>
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-80" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} />;
  }

  return (
    <div className={studentTokens.classes.page}>
      <div>
        <h1 className={studentTokens.classes.title}>Progreso</h1>
        <p className={studentTokens.classes.subtitle}>Evolucion de theta, desempeno por competencias y senales de riesgo cognitivo.</p>
      </div>

      <article className={`${studentTokens.classes.card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#0F2D52]">Riesgo cognitivo</h2>
          <StatusBadge label={data?.risk?.riskCognitive ? 'Atencion' : 'Estable'} tone={data?.risk?.riskCognitive ? 'warning' : 'ok'} />
        </div>
        <p className="mt-2 text-sm text-slate-600">{data?.risk?.message || 'Sin alertas de riesgo por ahora.'}</p>
      </article>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Evolucion theta</h2>
          {(data?.thetaSeries || []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin historial" description="Aun no hay puntos suficientes para graficar tu evolucion." />
            </div>
          ) : (
            <div className="mt-3 h-72">
              <Line data={thetaChart} options={{ responsive: true, maintainAspectRatio: false }} />
            </div>
          )}
        </article>

        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Competencias</h2>
          {(data?.competencies || []).length === 0 ? (
            <div className="mt-3">
              <EmptyState title="Sin competencias" description="Completa simulacros para activar este analisis." />
            </div>
          ) : (
            <div className="mt-3 h-72">
              <Bar
                data={competencyChart}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>
          )}
        </article>
      </section>

      {(data?.competencies || []).length ? (
        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Detalle por competencia</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.competencies.map((item) => (
              <div key={item.area} className="rounded-xl bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-800">{item.area}</p>
                <p>Theta: {Number(item.theta || 0).toFixed(2)}</p>
                <p>Score: {item.score0_100}</p>
                <p>Preguntas: {item.questionsAnswered}</p>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

export default StudentProgress;
