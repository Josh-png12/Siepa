// frontend/src/pages/teacher/TeacherCourses.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import axios from 'axios';

function TeacherCourses() {
  const { token } = useAuthStore();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const res = await axios.get('http://localhost:5000/api/teacher/courses', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCourses(res.data.courses || []);
      } catch (err) {
        console.error(err);
        setError('Error al cargar cursos');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchCourses();
  }, [token]);

  const irAGestionar = (courseId) => {
    navigate(courseId);
  };

  if (loading) return <div className="text-center py-20 text-xl">Cargando cursos...</div>;
  if (error) return <div className="text-red-600 text-center py-20">{error}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-[#0A2E57]">Gestión de Grupos y Cursos</h2>
      </div>

      {/* Cards de Cursos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {courses.map(course => (
          <div key={course._id} className="bg-white rounded-3xl p-8 shadow hover:shadow-2xl transition cursor-pointer" onClick={() => irAGestionar(course._id)}>
            <h3 className="text-2xl font-bold mb-2">#{course.name}</h3>
            <p className="text-gray-500 mb-6">{course.grade}</p>
            <div className="flex items-center gap-4 mb-6">
              <div className="text-4xl">📊</div>
              <div>
                <p className="text-5xl font-bold text-[#002855]">{course.averageTheta.toFixed(2)}</p>
                <p className="text-sm text-gray-500">θ Promedio</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button className="bg-[#002855] text-white py-3 px-6 rounded-2xl font-semibold">Simulacros</button>
              <button className="bg-blue-600 text-white py-3 px-6 rounded-2xl font-semibold">Estudiantes</button>
              <button className="bg-green-600 text-white py-3 px-6 rounded-2xl font-semibold">Analítica</button>
            </div>
          </div>
        ))}
      </div>

      {/* Tabla de Grupos */}
      <div className="bg-white rounded-3xl p-8 shadow">
        <h3 className="text-2xl font-bold mb-6">Mis Grupos</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="pb-4">Grupo</th>
              <th className="pb-4">Nivel</th>
              <th className="pb-4">Estudiantes</th>
              <th className="pb-4">θ promedio</th>
              <th className="pb-4">Estado</th>
              <th className="pb-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(course => (
              <tr key={course._id} className="border-b hover:bg-gray-50">
                <td className="py-4">#{course.name}</td>
                <td className="py-4">{course.grade}</td>
                <td className="py-4">{course.students?.length || 0}</td>
                <td className="py-4">{course.averageTheta?.toFixed(2) || 0}</td>
                <td className="py-4"><span className="text-green-600">Activo</span></td>
                <td className="py-4">
                  <button onClick={() => irAGestionar(course._id)} className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-medium">
                    Gestionar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeacherCourses;
