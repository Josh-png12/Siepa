import { useEffect, useMemo, useState } from 'react';
import { studentGetOverview, studentGetResults } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import StatusBadge from '../../components/ui/StatusBadge';
import { studentTokens } from './studentTokens';

function StudentStudyPlan() {
  const [overview, setOverview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [overviewRes, resultsRes] = await Promise.all([
          studentGetOverview(),
          studentGetResults({ scope: 'all' })
        ]);
        setOverview(overviewRes.data || null);
        setResults(resultsRes.data || null);
        setError('');
      } catch (err) {
        const details = err.response?.data?.errors;
        setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar tu plan de estudio');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const tasks = useMemo(() => {
    const areaTasks = (results?.areas || [])
      .filter((area) => area.score0_100 !== null)
      .sort((a, b) => Number(a.score0_100 || 0) - Number(b.score0_100 || 0))
      .slice(0, 3)
      .map((area, index) => ({
        id: `${area.name}-${index}`,
        type: index === 0 ? 'Prioridad alta' : 'Prioridad media',
        title: `Practica recomendada: ${area.name}`,
        description: area.recommendations?.[0] || `Refuerza ${area.name} con sets de preguntas de dificultad progresiva.`
      }));

    const objectiveTask = overview?.objective?.title
      ? [{
          id: 'objective',
          type: 'Objetivo semanal',
          title: overview.objective.title,
          description: overview.objective.description
        }]
      : [];

    return [...objectiveTask, ...areaTasks];
  }, [overview, results]);

  if (loading) {
    return (
      <div className={studentTokens.classes.page}>
        <LoadingSkeleton className="h-24" />
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
        <h1 className={studentTokens.classes.title}>Plan de estudio</h1>
        <p className={studentTokens.classes.subtitle}>Ruta inteligente basada en tus debilidades por area y comportamiento reciente.</p>
      </div>

      {!tasks.length ? (
        <EmptyState title="Aun no hay plan personalizado" description="Presenta simulacros para activar recomendaciones automaticas." />
      ) : (
        <section className="grid gap-3">
          {tasks.map((task) => (
            <article key={task.id} className={`${studentTokens.classes.card} p-4`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">{task.title}</p>
                <StatusBadge label={task.type} tone={task.type === 'Prioridad alta' ? 'danger' : 'info'} />
              </div>
              <p className="mt-2 text-sm text-slate-600">{task.description}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export default StudentStudyPlan;
