import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getSimulacroStudentResults } from '../../services/api';

function RadarChart({ data }) {
  const size = 260;
  const center = size / 2;
  const radius = 90;

  if (!data.length) return null;

  const angleStep = (Math.PI * 2) / data.length;

  const toPoint = (index, value) => {
    const normalized = Math.max(0, Math.min(1, (Number(value) + 3) / 6));
    const angle = -Math.PI / 2 + index * angleStep;
    const r = radius * normalized;

    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  };

  const polygon = data
    .map((item, index) => {
      const point = toPoint(index, item.theta);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[1, 2, 3].map((ring) => (
        <circle key={ring} cx={center} cy={center} r={(radius / 3) * ring} fill="none" stroke="#d1d5db" strokeWidth="1" />
      ))}

      {data.map((item, index) => {
        const angle = -Math.PI / 2 + index * angleStep;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const lx = center + (radius + 18) * Math.cos(angle);
        const ly = center + (radius + 18) * Math.sin(angle);

        return (
          <g key={item.moduleName}>
            <line x1={center} y1={center} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" fontSize="10" fill="#334155">{item.moduleName}</text>
          </g>
        );
      })}

      <polygon points={polygon} fill="rgba(37,99,235,0.2)" stroke="#2563eb" strokeWidth="2" />
    </svg>
  );
}

function SimulacroResults() {
  const { id } = useParams();
  const location = useLocation();
  const isTeacherView = location.pathname.includes('/dashboard/docente');

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(!isTeacherView);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isTeacherView) return;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getSimulacroStudentResults(id);
        setResult(response.result);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar resultados');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isTeacherView]);

  const moduleRows = useMemo(() => result?.thetasByModule || [], [result]);

  if (isTeacherView) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Resultados del Simulacro</h1>
        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-gray-600">
            La vista detallada por estudiante se consume desde ruta de estudiante (`/simulacros/:id/results`).
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="bg-white p-6 rounded-2xl shadow">Cargando resultados...</div>;
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div>;
  }

  if (!result) {
    return <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded-lg">No hay resultados disponibles.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-[#0A2E57]">Resultados: {result.simulacroId?.title}</h1>

      <section className="grid md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm text-gray-500">Theta Global</p>
          <p className="text-3xl font-bold text-[#0A2E57]">{Number(result.overallTheta || 0).toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm text-gray-500">Percentil</p>
          <p className="text-3xl font-bold text-[#0A2E57]">{result.percentile || 0}</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm text-gray-500">Preguntas respondidas</p>
          <p className="text-3xl font-bold text-[#0A2E57]">{result.answers?.length || 0}</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm text-gray-500">Duracion</p>
          <p className="text-3xl font-bold text-[#0A2E57]">
            {result.startTime && result.endTime
              ? `${Math.round((new Date(result.endTime) - new Date(result.startTime)) / 60000)} min`
              : '-'}
          </p>
        </div>
      </section>

      <section className="grid lg:grid-cols-[300px_1fr] gap-4">
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-center">
          <RadarChart data={moduleRows} />
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Theta por modulo</h2>
          <div className="space-y-2">
            {moduleRows.map((item) => (
              <div key={item.moduleName} className="flex items-center justify-between border rounded-lg p-3">
                <span>{item.moduleName}</span>
                <span className="font-semibold">{Number(item.theta || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="text-lg font-semibold text-[#0A2E57] mb-3">Item breakdown</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="p-2">Question ID</th>
                <th className="p-2">Respuesta</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(result.answers || []).map((answer) => (
                <tr key={`${answer.questionId}-${answer.selectedOption}`} className="border-b">
                  <td className="p-2">{String(answer.questionId)}</td>
                  <td className="p-2">{answer.selectedOption}</td>
                  <td className={`p-2 ${answer.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                    {answer.isCorrect ? 'Correcta' : 'Incorrecta'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default SimulacroResults;
