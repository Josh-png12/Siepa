import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { studentGetOverview } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ErrorState from '../../components/ui/ErrorState';
import { useAuthStore } from '../../store/useAuthStore';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// ── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  const frame = useRef(null);

  useEffect(() => {
    const numTarget = parseFloat(target) || 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(parseFloat((numTarget * eased).toFixed(2)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

// ── Kpi card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, rawValue, format, icon, colorFn, borderColor, delay = 0 }) {
  const animValue = useCountUp(parseFloat(rawValue) || 0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const displayed = format === 'decimal'
    ? animValue.toFixed(2)
    : Math.round(animValue).toString();

  const valueColor = colorFn ? colorFn(parseFloat(rawValue) || 0) : 'text-[#1e3a5f]';

  return (
    <article
      className={`bg-white rounded-2xl border-l-4 shadow-md hover:shadow-lg hover:-translate-y-1
        transition-all duration-200 p-5 flex flex-col gap-1
        ${borderColor}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        transition-all duration-500`}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</p>
        <span className="text-2xl select-none">{icon}</span>
      </div>
      <p className={`text-4xl font-black mt-1 ${valueColor}`}>{displayed}</p>
    </article>
  );
}

function thetaColor(v) { return v >= 0.5 ? 'text-emerald-600' : v >= -0.5 ? 'text-amber-500' : 'text-red-500'; }
function scoreColor(v) { return v >= 70 ? 'text-emerald-600' : v >= 40 ? 'text-amber-500' : 'text-red-500'; }
function percentilColor(v) { return v >= 70 ? 'text-emerald-600' : v >= 30 ? 'text-amber-500' : 'text-red-500'; }
function completadosColor(v) { return v > 0 ? 'text-violet-600' : 'text-slate-400'; }

// ── Empty states ─────────────────────────────────────────────────────────────
function EmptyCalendar({ onAction }) {
  return (
    <div className="flex flex-col items-center py-8 text-center gap-3">
      <svg className="w-14 h-14 text-blue-200" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={1.2}>
        <rect x="8" y="12" width="48" height="44" rx="6" />
        <path d="M8 24h48M22 8v8M42 8v8" strokeLinecap="round" />
        <circle cx="20" cy="36" r="2" fill="currentColor" stroke="none" />
        <circle cx="32" cy="36" r="2" fill="currentColor" stroke="none" />
        <circle cx="44" cy="36" r="2" fill="currentColor" stroke="none" />
      </svg>
      <div>
        <p className="font-semibold text-slate-700">¡Tu próximo desafío te espera!</p>
        <p className="text-sm text-slate-500 mt-1">Tu docente publicará un simulacro pronto 🎯</p>
      </div>
      <button type="button" onClick={onAction}
        className="rounded-xl bg-[#1e3a5f] text-white text-sm px-4 py-2 hover:bg-[#162d4a] transition-colors">
        Ver simulacros
      </button>
    </div>
  );
}

function EmptyTrophy() {
  return (
    <div className="flex flex-col items-center py-8 text-center gap-3">
      <svg className="w-14 h-14 text-amber-200" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={1.2}>
        <path d="M22 8h20v20a10 10 0 01-20 0V8z" strokeLinejoin="round" />
        <path d="M22 14H10a8 8 0 008 8M42 14h12a8 8 0 01-8 8M32 38v10M24 48h16" strokeLinecap="round" />
      </svg>
      <div>
        <p className="font-semibold text-slate-700">Completa tu primer simulacro</p>
        <p className="text-sm text-slate-500 mt-1">y verás tu evolución aquí 🚀</p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-44 gap-3">
      <svg className="w-full h-20" viewBox="0 0 300 60" fill="none">
        <polyline
          points="10,50 50,42 90,38 130,30 170,22 210,16 250,10 290,6"
          stroke="#cbd5e1" strokeWidth="2.5" strokeDasharray="6 4"
          strokeLinecap="round" strokeLinejoin="round"
        />
        {[10,50,90,130,170,210,250,290].map((x,i) => {
          const ys = [50,42,38,30,22,16,10,6];
          return <circle key={x} cx={x} cy={ys[i]} r="4" fill="#e2e8f0" />;
        })}
      </svg>
      <p className="text-sm text-slate-400 text-center">Tu curva de aprendizaje aparecerá cuando completes simulacros</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function StudentHome() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await studentGetOverview();
        setData(res.data || null);
      } catch (err) {
        const d = err.response?.data?.errors;
        setError(Array.isArray(d) && d.length ? d.join(' | ') : 'No se pudo cargar tu inicio');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const weeklyChart = useMemo(() => {
    const series = data?.weeklyProgress || [];
    return {
      labels: series.map((p) => new Date(p.date).toLocaleDateString('es-CO', { weekday: 'short' })),
      datasets: [{
        label: 'Theta semanal',
        data: series.map((p) => p.theta),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.12)',
        tension: 0.4,
        pointBackgroundColor: '#3b82f6',
        pointRadius: 4,
        spanGaps: true,
      }],
    };
  }, [data]);

  const firstName = user?.name?.split(' ')[0] || 'Estudiante';

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton className="h-20 rounded-2xl" />
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {[1,2,3,4].map((i) => <LoadingSkeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <LoadingSkeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] p-5 text-white shadow-md">
        <p className="text-xl font-bold">¡Hola, {firstName}! 👋</p>
        <p className="text-sm text-blue-100 mt-1">Sigue así — cada práctica te acerca al ICFES. ¡Tú puedes!</p>
      </div>

      {/* KPI grid */}
      <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <KpiCard
          title="Theta ICFES"
          rawValue={data?.kpis?.thetaActual ?? 0}
          format="decimal"
          icon="🧠"
          colorFn={thetaColor}
          borderColor="border-blue-500"
          delay={0}
        />
        <KpiCard
          title="Score global"
          rawValue={data?.kpis?.scoreGlobal ?? 0}
          icon="🏆"
          colorFn={scoreColor}
          borderColor="border-amber-400"
          delay={80}
        />
        <KpiCard
          title="Percentil"
          rawValue={data?.kpis?.percentil ?? 0}
          icon="📊"
          colorFn={percentilColor}
          borderColor="border-emerald-500"
          delay={160}
        />
        <KpiCard
          title="Completados"
          rawValue={data?.kpis?.simulacrosCompletados ?? 0}
          icon="✅"
          colorFn={completadosColor}
          borderColor="border-violet-500"
          delay={240}
        />
      </section>

      {/* Charts row */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Weekly chart */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-[#1e3a5f]">Progreso semanal</h2>
              <p className="text-xs text-slate-400">Evolución de tu nivel esta semana</p>
            </div>
            {data?.kpis?.trend && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                (data.kpis.trend.delta ?? 0) > 0
                  ? 'bg-emerald-100 text-emerald-700'
                  : (data.kpis.trend.delta ?? 0) < 0
                    ? 'bg-red-100 text-red-600'
                    : 'bg-slate-100 text-slate-600'
              }`}>
                {data.kpis.trend.label || 'Estable'}
              </span>
            )}
          </div>
          {(data?.weeklyProgress || []).length ? (
            <div className="h-52">
              <Line
                data={weeklyChart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { grid: { color: '#f1f5f9' } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          ) : (
            <EmptyChart />
          )}
        </article>

        {/* Objective */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-1">Siguiente objetivo</h2>
          <div className="mt-3 rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100 p-4">
            <p className="font-semibold text-violet-800 text-sm">
              {data?.objective?.title || 'Completa un simulacro'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data?.objective?.description || 'Tu plan de estudio personalizado se activará con tu primer simulacro.'}
            </p>
            {data?.objective?.area && (
              <span className="mt-2 inline-block text-[10px] bg-violet-200 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
                Área: {data.objective.area}
              </span>
            )}
          </div>
        </article>
      </section>

      {/* Bottom cards */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Next simulacro */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-3">Próximo simulacro</h2>
          {!data?.nextSimulacro ? (
            <EmptyCalendar onAction={() => navigate('/dashboard/estudiante/simulacros')} />
          ) : (
            <div className="space-y-3">
              <p className="font-semibold text-slate-800">{data.nextSimulacro.title}</p>
              <p className="text-sm text-slate-500">{data.nextSimulacro.description || 'Listo para iniciar cuando quieras.'}</p>
              <p className="text-xs text-slate-400">
                {data.nextSimulacro.questionCount} preguntas
                {data.nextSimulacro.duration ? ` · ${data.nextSimulacro.duration} min` : ''}
              </p>
              <button
                type="button"
                onClick={() => navigate('/dashboard/estudiante/simulacros')}
                className="w-full rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold hover:bg-[#162d4a] transition-colors"
              >
                Ir a simulacros →
              </button>
            </div>
          )}
        </article>

        {/* Recent results */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-3">Resultados recientes</h2>
          {!(data?.latestResults || []).length ? (
            <EmptyTrophy />
          ) : (
            <div className="space-y-2">
              {data.latestResults.map((item) => (
                <div
                  key={`${item.type}-${item.date}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.type === 'physical' ? 'Físico' : 'Virtual'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black ${scoreColor(item.score)}`}>{item.score}</p>
                    <p className="text-xs text-slate-400">P{item.percentile}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

export default StudentHome;
