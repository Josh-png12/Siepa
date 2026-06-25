import { useEffect, useMemo, useState } from 'react';
import { studentGetOverview, studentGetResults } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ErrorState from '../../components/ui/ErrorState';

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: '📝',
    color: 'bg-blue-500',
    lightBg: 'bg-blue-50',
    borderColor: 'border-blue-200',
    title: 'Completa un simulacro',
    description: 'Presenta cualquier examen disponible en la sección Simulacros.',
  },
  {
    step: 2,
    icon: '🤖',
    color: 'bg-violet-500',
    lightBg: 'bg-violet-50',
    borderColor: 'border-violet-200',
    title: 'La IA analiza tus resultados',
    description: 'El sistema detecta las áreas donde tienes más margen de mejora usando modelos IRT.',
  },
  {
    step: 3,
    icon: '🗺️',
    color: 'bg-emerald-500',
    lightBg: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    title: 'Recibes tu ruta personalizada',
    description: 'Aquí aparecerá tu plan de estudio priorizado: primero lo que más impacta tu puntaje.',
  },
];

const PRIORITY_STYLES = {
  'Prioridad alta':   { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-700',    icon: '🔴', borderL: 'border-l-4 border-red-400' },
  'Prioridad media':  { bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700', icon: '🟡', borderL: 'border-l-4 border-amber-400' },
  'Objetivo semanal': { bg: 'bg-blue-50',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',  icon: '🎯', borderL: 'border-l-4 border-blue-400' },
};

// ── Empty — timeline ──────────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">🗺️</span>
        <h2 className="text-lg font-bold text-[#1e3a5f]">¿Cómo funciona tu plan?</h2>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-200 via-violet-200 to-emerald-200" />

        <div className="space-y-4">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="flex gap-4 relative">
              {/* Step circle */}
              <div className={`shrink-0 h-12 w-12 rounded-full ${item.color} flex items-center justify-center shadow-md z-10`}>
                <span className="text-xl">{item.icon}</span>
              </div>

              {/* Card */}
              <div className={`flex-1 rounded-2xl border ${item.borderColor} ${item.lightBg} p-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${item.color} text-white`}>
                    Paso {item.step}
                  </span>
                  <p className="font-bold text-slate-800 text-sm">{item.title}</p>
                </div>
                <p className="text-xs text-slate-500">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-6">
        Presenta tu primer simulacro para activar tu plan personalizado ✨
      </p>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task }) {
  const style = PRIORITY_STYLES[task.type] || PRIORITY_STYLES['Objetivo semanal'];

  return (
    <article className={`bg-white rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5 ${style.border} ${style.borderL}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{style.icon}</span>
          <p className="font-bold text-slate-800">{task.title}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${style.badge}`}>
          {task.type}
        </span>
      </div>
      {task.description && (
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{task.description}</p>
      )}
    </article>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function StudentStudyPlan() {
  const [overview, setOverview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [overviewRes, resultsRes] = await Promise.all([
          studentGetOverview(),
          studentGetResults({ scope: 'all' }),
        ]);
        setOverview(overviewRes.data || null);
        setResults(resultsRes.data || null);
        setError('');
      } catch (err) {
        const d = err.response?.data?.errors;
        setError(Array.isArray(d) && d.length ? d.join(' | ') : 'No se pudo cargar tu plan de estudio');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const tasks = useMemo(() => {
    const areaTasks = (results?.areas || [])
      .filter((a) => a.score0_100 !== null)
      .sort((a, b) => Number(a.score0_100 || 0) - Number(b.score0_100 || 0))
      .slice(0, 3)
      .map((area, i) => ({
        id: `${area.name}-${i}`,
        type: i === 0 ? 'Prioridad alta' : 'Prioridad media',
        title: `Practica recomendada: ${area.name}`,
        description: area.recommendations?.[0] || `Refuerza ${area.name} con sets de preguntas de dificultad progresiva.`,
      }));

    const objectiveTask = overview?.objective?.title
      ? [{
          id: 'objective',
          type: 'Objetivo semanal',
          title: overview.objective.title,
          description: overview.objective.description,
        }]
      : [];

    return [...objectiveTask, ...areaTasks];
  }, [overview, results]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton className="h-24 rounded-2xl" />
        <LoadingSkeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#1e3a5f]">Plan de Estudio</h1>
        <p className="text-sm text-slate-400 mt-1">Ruta inteligente basada en tus debilidades por área y comportamiento reciente.</p>
      </div>

      {!tasks.length ? (
        <HowItWorks />
      ) : (
        <>
          {/* Summary banner */}
          <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 p-5 text-white shadow-md">
            <p className="text-sm font-semibold text-violet-100">Tu ruta personalizada está lista</p>
            <p className="text-lg font-bold mt-0.5">
              {tasks.length} tarea{tasks.length !== 1 ? 's' : ''} recomendada{tasks.length !== 1 ? 's' : ''} para esta semana
            </p>
          </div>

          <section className="space-y-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export default StudentStudyPlan;
