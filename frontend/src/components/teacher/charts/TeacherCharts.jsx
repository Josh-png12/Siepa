import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  RadialLinearScale,
  Title,
  Tooltip
} from 'chart.js';
import { Bar, Line, Radar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function ThetaTrendChart({ trend = [] }) {
  const labels = trend.map((item) => item.month || item.label);
  const values = trend.map((item) => Number(item.avgTheta || item.value || 0));

  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: 'Theta promedio',
            data: values,
            borderColor: '#0A2E57',
            backgroundColor: 'rgba(10,46,87,0.15)',
            fill: true,
            tension: 0.35
          }
        ]
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }}
    />
  );
}

export function CompetencyBreakdownChart({ rows = [] }) {
  return (
    <Bar
      data={{
        labels: rows.map((item) => item.competency),
        datasets: [
          {
            label: 'Theta',
            data: rows.map((item) => Number(item.avgTheta || 0)),
            backgroundColor: '#63B32E'
          }
        ]
      }}
      options={{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }}
    />
  );
}

export function ComparisonChart({ rows = [] }) {
  return (
    <Bar
      data={{
        labels: rows.map((item) => item.courseName),
        datasets: [
          {
            label: 'Theta promedio',
            data: rows.map((item) => Number(item.avgTheta || 0)),
            backgroundColor: '#0A2E57'
          }
        ]
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false
      }}
    />
  );
}

export function CompetencyRadarChart({ rows = [] }) {
  return (
    <Radar
      data={{
        labels: rows.map((item) => item.competency),
        datasets: [
          {
            label: 'Competencias',
            data: rows.map((item) => Number(item.avgTheta || 0)),
            borderColor: '#F28C28',
            backgroundColor: 'rgba(242,140,40,0.2)'
          }
        ]
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { suggestedMin: -3, suggestedMax: 3 } },
        plugins: { legend: { display: false } }
      }}
    />
  );
}

export function PerformanceHeatmap({ rows = [] }) {
  if (!rows.length) return null;
  const columns = rows[0]?.values || [];

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left p-2">Estudiante</th>
            {columns.map((column) => (
              <th key={column.competency} className="text-left p-2">{column.competency}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.studentId} className="border-t border-slate-100">
              <td className="p-2 font-medium">{row.name}</td>
              {row.values.map((value) => {
                const theta = Number(value.theta || 0);
                const color =
                  theta >= 1 ? 'bg-emerald-100 text-emerald-800' :
                    theta >= 0 ? 'bg-amber-100 text-amber-800' :
                      'bg-red-100 text-red-700';
                return (
                  <td key={`${row.studentId}-${value.competency}`} className="p-2">
                    <span className={`px-2 py-1 rounded-md ${color}`}>{theta.toFixed(2)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeacherCharts(props) {
  const { variant } = props;

  if (variant === 'thetaTrend') return <ThetaTrendChart trend={props.trend} />;
  if (variant === 'competencyBreakdown') return <CompetencyBreakdownChart rows={props.rows} />;
  if (variant === 'comparison') return <ComparisonChart rows={props.rows} />;
  if (variant === 'radar') return <CompetencyRadarChart rows={props.rows} />;
  if (variant === 'heatmap') return <PerformanceHeatmap rows={props.rows} />;
  return null;
}

export default TeacherCharts;
