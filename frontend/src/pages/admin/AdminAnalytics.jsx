import { useEffect, useMemo, useState } from 'react';
import { adminGetGovernanceOCR, adminGetInstitutionAnalytics } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Toast from '../../components/ui/Toast';
import { adminTokens } from './adminTokens';

function AdminAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [governance, setGovernance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const [a, g] = await Promise.all([
        adminGetInstitutionAnalytics(),
        adminGetGovernanceOCR()
      ]);
      setAnalytics(a.data || null);
      setGovernance(g.data || null);
      setError('');
    } catch (err) {
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar');
      setToast({ type: 'error', message: err.response?.data?.message || 'Error cargando analitica institucional' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const topTeachers = useMemo(
    () => (analytics?.metrics?.teacherPerformance || []).slice(0, 10),
    [analytics]
  );

  if (loading) {
    return (
      <div className={adminTokens.classes.page}>
        <LoadingSkeleton className="h-20" />
        <LoadingSkeleton className="h-44" />
        <LoadingSkeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <div>
        <h1 className={adminTokens.classes.title}>Analitica Institucional</h1>
        <p className={adminTokens.classes.subtitle}>Metricas globales, comparativo de cursos y desempeno docente.</p>
      </div>

      {error ? <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} /> : null}

      {!analytics && !governance ? (
        <EmptyState title="Sin analitica disponible" description="Aun no hay suficientes datos para construir el tablero institucional." />
      ) : (
        <>
          <section className="grid md:grid-cols-4 gap-3">
            <Metric title="Riesgo global" value={Number(analytics?.metrics?.riskCognitiveIndex || 0).toFixed(4)} />
            <Metric title="OCR esperadas" value={governance?.totals?.expected || 0} />
            <Metric title="OCR recibidas" value={governance?.totals?.received || 0} />
            <Metric title="Tasa duplicados" value={`${((governance?.duplicateRate || 0) * 100).toFixed(2)}%`} />
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <div className={`${adminTokens.classes.card} p-4`}>
              <h2 className={adminTokens.classes.sectionHeader}>Comparativo por curso</h2>
              {(analytics?.metrics?.crossCourseComparison || []).length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="Sin comparativo" description="Todavia no hay datos consolidados por curso." />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {(analytics?.metrics?.crossCourseComparison || []).map((row) => (
                    <div key={row.courseId} className="rounded-lg bg-slate-50 p-2 text-sm">
                      <p className="font-medium text-slate-800">{row.courseId}</p>
                      <p className="text-slate-600">Theta: {Number(row.avgTheta || 0).toFixed(2)} | Riesgo: {row.riskStudents}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`${adminTokens.classes.card} p-4`}>
              <h2 className={adminTokens.classes.sectionHeader}>Resumen docente</h2>
              {topTeachers.length === 0 ? (
                <div className="mt-3">
                  <EmptyState title="Sin resumen docente" description="No hay actividad suficiente para este periodo." />
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {topTeachers.map((row) => (
                    <div key={row.teacherId} className="rounded-lg bg-slate-50 p-2 text-sm">
                      <p className="font-medium text-slate-800">{row.teacherId}</p>
                      <p className="text-slate-600">Theta promedio: {Number(row.avgTheta || 0).toFixed(2)} | Riesgo total: {row.atRiskStudents}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ title, value }) {
  return (
    <div className={`${adminTokens.classes.card} p-4`}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-xl font-bold text-[#0A2E57]">{value}</p>
    </div>
  );
}

export default AdminAnalytics;
