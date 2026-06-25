import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, BarElement,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { studentGetProgress } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ErrorState from '../../components/ui/ErrorState';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, BarElement);

// ── ICFES area palette ────────────────────────────────────────────────────────
const AREA_PALETTE = {
  'Lectura Crítica':    { color: '#3b82f6', light: '#eff6ff', icon: '📖' },
  'Matemáticas':        { color: '#10b981', light: '#f0fdf4', icon: '🔢' },
  'Ciencias Naturales': { color: '#f59e0b', light: '#fffbeb', icon: '🔬' },
  'Ciencias Sociales':  { color: '#8b5cf6', light: '#f5f3ff', icon: '🌍' },
  'Inglés':             { color: '#06b6d4', light: '#ecfeff', icon: '🇬🇧' },
};

const ALL_AREAS = ['Lectura Crítica', 'Matemáticas', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés'];

// ── Placeholder chart (animated dashed line) ─────────────────────────────────
function PlaceholderThetaChart() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 px-4">
      <svg className="w-full max-w-xs h-24" viewBox="0 0 280 60" fill="none">
        <defs>
          <linearGradient id="ghostGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
        <polyline
          points="10,52 50,44 90,36 130,28 170,18 220,12 270,6"
          stroke="url(#ghostGrad)" strokeWidth="3" strokeDasharray="8 5"
          strokeLinecap="round" strokeLinejoin="round"
        />
        {[10,50,90,130,170,220,270].map((x, i) => {
          const ys = [52,44,36,28,18,12,6];
          return <circle key={x} cx={x} cy={ys[i]} r="5" fill="#e2e8f0" />;
        })}
      </svg>
      <p className="text-sm text-slate-400 text-center">
        Tu curva de aprendizaje aparecerá aquí cuando completes simulacros
      </p>
    </div>
  );
}

// ── Locked competency card ────────────────────────────────────────────────────
function LockedAreaCard({ area }) {
  const pal = AREA_PALETTE[area] || { color: '#94a3b8', light: '#f8fafc', icon: '📚' };
  return (
    <div
      className="relative rounded-2xl border border-slate-100 p-4 flex flex-col items-center gap-2 text-center overflow-hidden"
      style={{ backgroundColor: pal.light }}
    >
      <div className="text-3xl grayscale opacity-40">{pal.icon}</div>
      <p className="text-xs font-semibold text-slate-400">{area}</p>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-2xl">
        <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

// ── Competency card ───────────────────────────────────────────────────────────
function CompetencyCard({ item }) {
  const pal = AREA_PALETTE[item.area] || { color: '#3b82f6', light: '#eff6ff', icon: '📚' };
  const score = Number(item.score0_100 || 0);
  const pct = Math.min(100, score);

  return (
    <div
      className="rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-shadow"
      style={{ backgroundColor: pal.light }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{pal.icon}</span>
        <p className="text-sm font-bold text-slate-700 truncate">{item.area}</p>
      </div>
      <p className="text-3xl font-black" style={{ color: pal.color }}>{score}</p>
      <p className="text-xs text-slate-400 mb-2">de 100 puntos</p>
      <div className="h-1.5 rounded-full bg-slate-200">
        <div
          className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: pal.color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>Theta {Number(item.theta || 0).toFixed(2)}</span>
        <span>{item.questionsAnswered} preg.</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function StudentProgress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await studentGetProgress();
      setData(res.data || null);
      setError('');
    } catch (err) {
      const d = err.response?.data?.errors;
      setError(Array.isArray(d) && d.length ? d.join(' | ') : 'No se pudo cargar tu progreso');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const thetaChart = useMemo(() => ({
    labels: (data?.thetaSeries || []).map((p) =>
      new Date(p.date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })),
    datasets: [{
      label: 'Theta',
      data: (data?.thetaSeries || []).map((p) => p.theta),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      tension: 0.4,
      pointBackgroundColor: '#3b82f6',
      pointRadius: 4,
    }],
  }), [data]);

  const competencyChart = useMemo(() => {
    const areas = data?.competencies || [];
    return {
      labels: areas.map((c) => c.area),
      datasets: [{
        label: 'Puntaje 0-100',
        data: areas.map((c) => c.score0_100),
        backgroundColor: areas.map((c) => (AREA_PALETTE[c.area]?.color || '#3b82f6') + 'cc'),
        borderRadius: 8,
        borderSkipped: false,
      }],
    };
  }, [data]);

  const hasCompetencies = (data?.competencies || []).length > 0;
  const hasThetaSeries = (data?.thetaSeries || []).length > 0;
  const isRisk = data?.risk?.riskCognitive;

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton className="h-24 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <LoadingSkeleton className="h-72 rounded-2xl" />
          <LoadingSkeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#1e3a5f]">Mi Progreso</h1>
        <p className="text-sm text-slate-400 mt-1">Evolución de theta, desempeño por área y señales de riesgo cognitivo.</p>
      </div>

      {/* Risk banner */}
      <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 border ${
        isRisk
          ? 'bg-red-50 border-red-200'
          : 'bg-emerald-50 border-emerald-200'
      }`}>
        {/* Shield icon */}
        <div className={`shrink-0 flex items-center justify-center h-12 w-12 rounded-xl ${
          isRisk ? 'bg-red-100' : 'bg-emerald-100'
        }`}>
          <svg className={`h-7 w-7 ${isRisk ? 'text-red-600' : 'text-emerald-600'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            {!isRisk && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />}
            {isRisk && <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01" />}
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className={`font-bold text-sm ${isRisk ? 'text-red-700' : 'text-emerald-700'}`}>
              Riesgo cognitivo:
            </p>
            <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
              isRisk ? 'bg-red-200 text-red-800' : 'bg-emerald-200 text-emerald-800'
            }`}>
              {isRisk ? '⚠ Atención requerida' : '✓ Estable'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-0.5">
            {data?.risk?.message || 'Sin alertas de riesgo por ahora. ¡Vas muy bien!'}
          </p>
        </div>
      </div>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Theta evolution */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-1">Evolución theta</h2>
          <p className="text-xs text-slate-400 mb-4">Nivel IRT a lo largo del tiempo</p>
          {hasThetaSeries ? (
            <div className="h-64">
              <Line
                data={thetaChart}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          ) : (
            <PlaceholderThetaChart />
          )}
        </article>

        {/* Competency chart */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-1">Puntaje por área</h2>
          <p className="text-xs text-slate-400 mb-4">Escala 0-100</p>
          {hasCompetencies ? (
            <div className="h-64">
              <Bar
                data={competencyChart}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { max: 100, grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-center px-4">
              <p className="text-sm text-slate-400">
                Completa simulacros para desbloquear el análisis por área
              </p>
            </div>
          )}
        </article>
      </section>

      {/* Competency detail cards */}
      <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
        <h2 className="font-bold text-[#1e3a5f] mb-4">Competencias ICFES</h2>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {hasCompetencies
            ? data.competencies.map((item) => (
                <CompetencyCard key={item.area} item={item} />
              ))
            : ALL_AREAS.map((area) => (
                <LockedAreaCard key={area} area={area} />
              ))
          }
        </div>
        {!hasCompetencies && (
          <p className="text-center text-xs text-slate-400 mt-4">
            🔒 Las áreas se desbloquean al completar tu primer simulacro
          </p>
        )}
      </article>
    </div>
  );
}

export default StudentProgress;
