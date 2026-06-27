import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  downloadTeacherCourseReport,
  getCourseDashboard,
  getTeacherCourseInsights
} from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Toast from '../../components/ui/Toast';
import ConfirmModal from '../../components/ui/ConfirmModal';

const LazyCharts = lazy(() => import('../../components/teacher/charts/TeacherCharts.jsx'));

function CourseDashboard() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [downloading, setDownloading] = useState(false);

  const pageSize = 8;

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [dashboardRes, insightsRes] = await Promise.all([
          getCourseDashboard(courseId),
          getTeacherCourseInsights(courseId)
        ]);
        setDashboard(dashboardRes.dashboard);
        setInsights(insightsRes.data);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar dashboard del curso');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [courseId]);

  const riskRows = useMemo(() => insights?.atRiskStudents || [], [insights]);
  const paginatedRiskRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return riskRows.slice(start, start + pageSize);
  }, [riskRows, page]);
  const totalPages = Math.max(1, Math.ceil(riskRows.length / pageSize));

  const metricCards = useMemo(
    () => [
      { label: 'Total estudiantes', value: dashboard?.metrics?.totalStudents || 0, tone: 'info' },
      { label: 'Nivel académico', value: Number(insights?.metrics?.averageTheta || dashboard?.metrics?.thetaAverage || 0).toFixed(2), tone: 'ok' },
      { label: 'Competencia mas debil', value: insights?.metrics?.weakestCompetency || 'N/A', tone: 'warning' },
      { label: 'En riesgo', value: insights?.metrics?.atRiskStudents || dashboard?.metrics?.studentsAtRisk || 0, tone: 'danger' },
      { label: 'Horas semanales', value: Number(dashboard?.metrics?.weeklyHours || 0).toFixed(1), tone: 'info' },
      { label: 'Proyeccion Saber 11', value: insights?.metrics?.projectedSaber11Score || 0, tone: 'ok' }
    ],
    [dashboard, insights]
  );

  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      const blob = await downloadTeacherCourseReport(courseId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-curso-${courseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setToast({ type: 'success', message: 'Reporte descargado correctamente.' });
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo descargar el reporte.' });
    } finally {
      setDownloading(false);
      setShowReportConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-64" />
        <LoadingSkeleton className="h-64" />
      </div>
    );
  }

  if (error) return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>;

  return (
    <div className="space-y-6">
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />
      <ConfirmModal
        isOpen={showReportConfirm}
        title="Generar reporte PDF"
        description="Se generará un reporte institucional con métricas, riesgo y análisis del curso."
        confirmLabel={downloading ? 'Generando...' : 'Descargar reporte'}
        onConfirm={handleDownloadReport}
        onCancel={() => setShowReportConfirm(false)}
      />

      <section className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricCards.map((metric) => (
          <div key={metric.label} className="bg-white rounded-2xl shadow p-4">
            <p className="text-xs text-gray-500">{metric.label}</p>
            <p className="text-2xl font-bold text-[#0A2E57]">{metric.value}</p>
            <div className="mt-2"><StatusBadge label="Actualizado" tone={metric.tone} /></div>
          </div>
        ))}
      </section>

      <section className="grid xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Desglose por competencia</h2>
          <div className="h-72">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <LazyCharts variant="competencyBreakdown" rows={insights?.charts?.competencyBreakdown || []} />
            </Suspense>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Radar de desempeno</h2>
          <div className="h-72">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <LazyCharts variant="radar" rows={insights?.charts?.competencyBreakdown || []} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="grid xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Tendencia del nivel académico</h2>
          <div className="h-72">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <LazyCharts variant="thetaTrend" trend={insights?.charts?.thetaTrend || []} />
            </Suspense>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Comparativo vs otros cursos</h2>
          <div className="h-72">
            <Suspense fallback={<LoadingSkeleton className="h-full" />}>
              <LazyCharts variant="comparison" rows={insights?.charts?.comparison || []} />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#0A2E57]">Deteccion inteligente de riesgo</h2>
          <button
            type="button"
            onClick={() => setShowReportConfirm(true)}
            className="px-4 py-2 rounded-lg bg-[#0A2E57] text-white text-sm"
          >
            Exportar reporte PDF
          </button>
        </div>
        {paginatedRiskRows.length === 0 ? (
          <EmptyState title="Sin estudiantes en riesgo" description="No hay alertas medias o altas para este curso." />
        ) : (
          <div className="space-y-2">
            {paginatedRiskRows.map((row) => (
              <div key={row.studentId} className="grid md:grid-cols-5 gap-2 items-center p-3 bg-slate-50 rounded-lg text-sm">
                <p className="font-medium text-slate-800">{row.name}</p>
                <p>Nivel {Number(row.theta || 0).toFixed(2)}</p>
                <p>Tendencia {Number(row.trend || 0).toFixed(2)}</p>
                <p>{row.daysWithoutActivity} dias sin actividad</p>
                <div>
                  <StatusBadge label={row.status.toUpperCase()} tone={row.status === 'alto' ? 'danger' : 'warning'} />
                </div>
              </div>
            ))}
            <div className="flex justify-end items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="px-3 py-1 rounded bg-slate-200 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-sm text-slate-600">{page}/{totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="px-3 py-1 rounded bg-slate-200 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-lg font-semibold text-[#0A2E57]">Mapa de desempeño</h2>
        {(insights?.charts?.heatmap || []).length === 0 ? (
          <EmptyState title="Sin datos para heatmap" description="No hay competencias suficientes para construir el mapa." />
        ) : (
          <Suspense fallback={<LoadingSkeleton className="h-44" />}>
            <LazyCharts variant="heatmap" rows={insights?.charts?.heatmap || []} />
          </Suspense>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="text-lg font-semibold text-[#0A2E57]">Análisis y recomendaciones</h2>
        <div className="flex flex-wrap gap-2">
          {(insights?.insights?.recommendedCompetencies || []).map((item) => (
            <StatusBadge key={item} label={`Reforzar ${item}`} tone="warning" />
          ))}
          {(insights?.insights?.suggestedQuestionTags || []).map((item) => (
            <StatusBadge key={item.tag} label={`${item.tag} (${item.availableQuestions})`} tone="info" />
          ))}
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          {(insights?.insights?.recommendedActions || []).map((action, index) => (
            <li key={`${action}-${index}`} className="p-3 rounded-lg bg-slate-50">{index + 1}. {action}</li>
          ))}
        </ul>
      </section>

      <div className="flex gap-2">
        <button type="button" onClick={() => navigate('students')} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg">Ver estudiantes</button>
        <button type="button" onClick={() => navigate('materials')} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Ver materiales</button>
      </div>
    </div>
  );
}

export default CourseDashboard;
