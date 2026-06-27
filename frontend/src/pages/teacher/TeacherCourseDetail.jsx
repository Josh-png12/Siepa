// frontend/src/pages/docente/TeacherCourseDetail.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';

function TeacherCourseDetail() {
  const { courseId } = useParams();
  const { token } = useAuthStore();
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCourseDetail = async () => {
      try {
        const res = await api.get(`/teacher/courses/${courseId}`);
        setCourse(res.data.course);
        setStudents(res.data.students);
      } catch (err) {
        console.error(err);
        setError('Error al cargar detalle del curso');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchCourseDetail();
  }, [courseId, token]);

  if (loading) return <div className="text-center py-20 text-xl">Cargando detalle del curso...</div>;
  if (error) return <div className="text-red-600 text-center py-20">{error}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-[#0A2E57]">{course?.name} - Detalle</h2>
      </div>

      {/* Lista de Estudiantes */}
      <div className="bg-white rounded-3xl p-8 shadow">
        <h3 className="text-2xl font-bold mb-6">Estudiantes</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-4">Estudiante</th>
              <th className="pb-4">Nivel académico</th>
              <th className="pb-4">Percentil</th>
              <th className="pb-4">Último Simulacro</th>
              <th className="pb-4">Riesgo</th>
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student._id} className="border-b hover:bg-gray-50">
                <td className="py-4">{student.name}</td>
                <td className="py-4">{student.currentTheta?.toFixed(2)}</td>
                <td className="py-4">{student.percentil}</td>
                <td className="py-4">Simulacro #5</td>
                <td className="py-4">
                  <span className="text-red-600">⚠️ Bajo</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeacherCourseDetail;