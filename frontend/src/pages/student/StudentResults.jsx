import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadarController,
  RadialLinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Radar } from 'react-chartjs-2';
import { getEvaluationResult, studentGetResults } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import StatusBadge from '../../components/ui/StatusBadge';
import { studentTokens } from './studentTokens';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  RadarController,
  RadialLinearScale,
  BarElement,
  Tooltip,
  Legend
);

const scopes = [
  { id: 'all', label: 'Todo' },
  { id: 'virtual', label: 'Virtual' },
  { id: 'physical', label: 'Fisico' }
];

function StudentResults() {
  const { id, evaluationId } = useParams();
  const detailId = evaluationId || id;

  const [scope, setScope] = useState('all');
  const [data, setData] = useState(null);
  const [activeArea, setActiveArea] = useState('Lectura Critica');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const response = await studentGetResults({ scope });
      setData(response.data || null);
      setError('');
    } catch (err) {
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudieron cargar resultados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [scope]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!detailId) {
        setDetail(null);
        return;
      }
      try {
        const response = await getEvaluationResult(detailId);
        setDetail(response.result || null);
      } catch (_err) {
        setDetail(null);
      }
    };

    loadDetail();
  }, [detailId]);

  const areas = data?.areas || [];
  const currentArea = areas.find((item) => item.name === activeArea) || areas[0] || null;

  const timelineChartData = useMemo(() => ({
    labels: (data?.timeline || []).map((item) => new Date(item.date).toLocaleDateString('es-CO')),
    datasets: [
      {
        label: 'Puntaje total',
        data: (data?.timeline || []).map((item) => item.score),
        borderColor: '#0F2D52',
        backgroundColor: 'rgba(15,45,82,0.2)',
        tension: 0.3
      }
    ]
  }), [data]);

  const radarData = useMemo(() => ({
    labels: areas.map((item) => item.name),
    datasets: [
      {
        label: 'Puntaje por area',
        data: areas.map((item) => item.score0_100 || 0),
        borderColor: '#00A3E0',
        backgroundColor: 'rgba(0,163,224,0.25)'
      }
    ]
  }), [areas]);

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

  if (!data || (data.timeline || []).length === 0) {
    return (
      <div className={studentTokens.classes.page}>
        <h1 className={studentTokens.classes.title}>Resultados</h1>
        <EmptyState title="Aun no hay resultados" description="Presenta tu primer simulacro para visualizar score, percentil y recomendaciones por area." />
      </div>
    );
  }

  return (
    <div className={studentTokens.classes.page}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className={studentTokens.classes.title}>Resultados</h1>
          <p className={studentTokens.classes.subtitle}>Panel integrado estilo ICFES: virtual + fisico en una sola linea de tiempo.</p>
        </div>
        <button
          type="button"
          disabled
          title="Descarga PDF disponible cuando el endpoint institucional este habilitado"
          className="rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-500 cursor-not-allowed"
        >
          Descargar PDF
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {scopes.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setScope(item.id)}
            className={scope === item.id ? studentTokens.classes.buttonPrimary : studentTokens.classes.buttonGhost}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Stat title="Puntaje global (0-500)" value={data.globalScore0_500} />
        <Stat title="Percentil" value={data.percentile} />
        <Stat title="Promedio curso" value={data.comparisons?.courseAvg ?? '-'} />
        <Stat title="Promedio institucion" value={data.comparisons?.institutionAvg ?? '-'} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className={`${studentTokens.classes.card} p-4 lg:col-span-2`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Linea de tiempo de resultados</h2>
          <div className="mt-3 h-72">
            <Line
              data={timelineChartData}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
            />
          </div>
        </article>

        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Mapa por areas</h2>
          <div className="mt-3 h-72">
            <Radar data={radarData} options={{ responsive: true, maintainAspectRatio: false }} />
          </div>
        </article>
      </section>

      <section className={`${studentTokens.classes.card} p-4`}>
        <div className="flex flex-wrap gap-2">
          {areas.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setActiveArea(item.name)}
              className={activeArea === item.name ? studentTokens.classes.buttonPrimary : studentTokens.classes.buttonGhost}
            >
              {item.name}
            </button>
          ))}
        </div>

        {!currentArea ? (
          <div className="mt-3">
            <EmptyState title="Sin areas" description="No hay desglose por areas disponible." />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              <p><strong>Puntaje:</strong> {currentArea.score0_100 ?? '-'}</p>
              <p><strong>Nivel:</strong> {currentArea.level}</p>
              <p><strong>Percentil:</strong> {currentArea.percentile ?? '-'}</p>
              <p><strong>Nivel académico:</strong> {currentArea.theta ?? '-'}</p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-700">Fortalezas</p>
              {(currentArea.strengths || []).length ? (
                <ul className="mt-2 list-disc pl-4 text-slate-600">
                  {currentArea.strengths.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-slate-500">Aun sin fortalezas destacadas en esta area.</p>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-700">Debilidades y recomendaciones</p>
              {(currentArea.weaknesses || []).length ? (
                <ul className="mt-2 list-disc pl-4 text-slate-600">
                  {currentArea.weaknesses.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-slate-500">Vas bien en esta area. Mantener practica constante.</p>
              )}

              {(currentArea.recommendations || []).length ? (
                <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-700">
                  {currentArea.recommendations.map((item) => <p key={item}>{item}</p>)}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {detail ? (
        <section className={`${studentTokens.classes.card} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F2D52]">Detalle de evaluacion</h2>
            <StatusBadge label={detail.type === 'physical' ? 'Simulacro Fisico' : 'Simulacro Virtual'} tone="info" />
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm">
            <p><strong>Score:</strong> {detail.globalScore ?? '-'}</p>
            <p><strong>Nivel académico:</strong> {detail.theta ?? '-'}</p>
            <p><strong>Percentil:</strong> {detail.percentile ?? '-'}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <article className={`${studentTokens.classes.card} p-4`}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-[#0F2D52]">{value}</p>
    </article>
  );
}

export default StudentResults;
