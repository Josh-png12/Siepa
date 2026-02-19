import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import api, { getTeacherDashboardInsights } from '../../services/api';
import StatsCard from '../../components/ui/StatsCard';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Toast from '../../components/ui/Toast';

const LazyCharts = lazy(() => import('../../components/teacher/charts/TeacherCharts.jsx'));

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-4 gap-4">
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
      </div>
      <LoadingSkeleton className="h-72" />
      <LoadingSkeleton className="h-52" />
    </div>
  );
}

function TeacherDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        setError('');

        const [dashboardRes, insightsRes] = await Promise.all([
          api.get('/teacher/dashboard'),
          getTeacherDashboardInsights()
        ]);

        setDashboard(dashboardRes.data.data);
        setInsights(insightsRes.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Error cargando el dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  const trendRows = useMemo(
    () => (dashboard?.thetaTrend || []).map((value, idx) => ({ month: `P${idx + 1}`, avgTheta: value })),
    [dashboard]
  );

  const topRiskCourses = useMemo(() => insights?.topAtRiskCourses || [], [insights]);
  const alerts = useMemo(() => insights?.insights?.alerts || [], [insights]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">{error}</div>;

  return (
    <div className="space-y-8">
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">Teacher Pro Dashboard</h1>
          <p className="text-slate-500">Analitica unificada + inteligencia pedagógica.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge label={`Proyeccion Saber 11: ${insights?.summary?.projectedSaber11Score || 0}`} tone="info" />
          <StatusBadge
            label={`Tendencia ${Number(insights?.summary?.trendDelta || 0) >= 0 ? 'positiva' : 'negativa'}`}
            tone={Number(insights?.summary?.trendDelta || 0) >= 0 ? 'ok' : 'warning'}
          />
        </div>
      </header>

      <section className="grid md:grid-cols-4 gap-5">
        <StatsCard title="Cursos" value={dashboard?.totalCourses || 0} color="text-[#0A2E57]" />
        <StatsCard title="Estudiantes" value={dashboard?.totalStudents || 0} color="text-[#63B32E]" />
        <StatsCard title="Theta Promedio" value={Number(dashboard?.averageTheta || 0).toFixed(2)} color="text-[#F28C28]" />
        <StatsCard title="Simulacros" value={dashboard?.simulacrosAplicados || 0} color="text-[#0A2E57]" />
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Tendencia de theta global</h2>
          <div className="h-72">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <LazyCharts variant="thetaTrend" trend={trendRows} />
            </Suspense>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5 space-y-3">
          <h2 className="text-lg font-semibold text-[#0A2E57]">Smart Insights</h2>
          <div className="space-y-2">
            {(insights?.insights?.recommendedCompetencies || []).map((item) => (
              <StatusBadge key={item} label={`Reforzar: ${item}`} tone="warning" />
            ))}
          </div>
          <div className="pt-2 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-700">Etiquetas sugeridas del banco</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {(insights?.insights?.suggestedQuestionTags || []).map((item) => (
                <span key={item.tag} className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                  {item.tag} ({item.availableQuestions})
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Cursos con mayor riesgo</h2>
          {topRiskCourses.length === 0 ? (
            <EmptyState title="Sin alertas" description="No hay cursos con estudiantes en riesgo." />
          ) : (
            <div className="space-y-2">
              {topRiskCourses.map((course) => (
                <div key={course.courseId} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <p className="font-semibold text-slate-800">{course.courseName}</p>
                    <p className="text-xs text-slate-500">Theta {Number(course.averageTheta || 0).toFixed(2)}</p>
                  </div>
                  <StatusBadge label={`${course.atRiskStudents} en riesgo`} tone={course.atRiskStudents > 0 ? 'danger' : 'ok'} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Alertas inteligentes</h2>
          {alerts.length === 0 ? (
            <EmptyState title="Todo estable" description="No hay alertas críticas para tus cursos." />
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, index) => (
                <div key={`${alert.title}-${index}`} className="border border-amber-200 bg-amber-50 p-3 rounded-lg">
                  <p className="font-medium text-amber-900">{alert.title}</p>
                  <p className="text-sm text-amber-800">{alert.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default TeacherDashboard;
