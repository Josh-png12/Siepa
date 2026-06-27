import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getCourseStudentDetail, getCourseStudents } from '../../services/api';

function formatLastLogin(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function CourseStudents() {
  const { courseId } = useParams();

  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getCourseStudents(courseId);
        setStudents(response.students || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar estudiantes del curso');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [courseId]);

  const statusClass = useMemo(
    () => ({
      active: 'bg-green-100 text-green-700',
      intermittent: 'bg-yellow-100 text-yellow-700',
      inactive: 'bg-red-100 text-red-700'
    }),
    []
  );

  const viewDetail = async (studentId) => {
    try {
      setDetailLoading(true);
      const response = await getCourseStudentDetail(courseId, studentId);
      setSelectedStudent(response);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar detalle del estudiante');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div> : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Email</th>
              <th className="p-3">Última conexión</th>
              <th className="p-3">Tiempo semanal</th>
              <th className="p-3">Simulacros</th>
              <th className="p-3">Nivel académico</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="8">Cargando...</td></tr>
            ) : students.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="8">No hay estudiantes en el curso.</td></tr>
            ) : (
              students.map((student) => (
                <tr key={student.studentId} className="border-b">
                  <td className="p-3">{student.name}</td>
                  <td className="p-3">{student.email}</td>
                  <td className="p-3">{formatLastLogin(student.lastLogin)}</td>
                  <td className="p-3">{Number(student.weeklyActiveHours || 0).toFixed(2)} h</td>
                  <td className="p-3">{student.totalSimulacrosCompleted || 0}</td>
                  <td className="p-3">{Number(student.latestTheta || 0).toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${statusClass[student.status] || 'bg-gray-100 text-gray-700'}`}>
                      {student.status === 'active' ? 'Activo' : student.status === 'inactive' ? 'Inactivo' : student.status === 'intermittent' ? 'Intermitente' : student.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <button type="button" onClick={() => viewDetail(student.studentId)} className="bg-blue-600 text-white px-3 py-1 rounded">
                      Ver detalles
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {detailLoading ? <div className="bg-white rounded-2xl shadow p-4">Cargando detalle...</div> : null}

      {selectedStudent ? (
        <section className="bg-white rounded-2xl shadow p-5 space-y-3">
          <h2 className="text-xl font-semibold text-[#0A2E57]">Detalle de {selectedStudent.student?.name}</h2>

          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div><span className="font-semibold">Nivel académico promedio:</span> {Number(selectedStudent.student?.averageTheta || 0).toFixed(2)}</div>
            <div><span className="font-semibold">Nivel actual:</span> {Number(selectedStudent.student?.latestTheta || 0).toFixed(2)}</div>
            <div><span className="font-semibold">Horas semanales:</span> {Number(selectedStudent.student?.weeklyActiveHours || 0).toFixed(2)}</div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Historial de actividad reciente</h3>
            {selectedStudent.loginHistory?.length ? (
              <div className="space-y-2">
                {selectedStudent.loginHistory.map((row, idx) => (
                  <div key={`${row.openedAt}-${idx}`} className="text-sm border rounded p-2">
                    <p>{new Date(row.openedAt).toLocaleString()} | {row.materialTitle || 'Material'} | {row.downloaded ? 'descargó' : 'abrió'} | {row.timeSpent || 0}s</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sin actividad registrada.</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default CourseStudents;
