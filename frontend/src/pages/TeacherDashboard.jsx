// frontend/src/pages/teacher/TeacherDashboard.jsx
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import TeacherSidebar from '../../components/teacher/TeacherSidebar';  // Agrega sidebar persistente

function TeacherDashboard() {
  const { user, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.role !== 'docente') {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/teacher/dashboard');
        setDashboard(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'Error al cargar el dashboard');
        console.error('Error fetching dashboard:', err);
      } finally {
        setLoading(false);
      }
    };
    if (token) {
      fetchDashboard();
    } else {
      setLoading(false);
      setError('No se encontró token de autenticación');
    }
  }, [token]);

  if (loading) return <div className="text-center py-20 text-xl">Cargando dashboard...</div>;

  if (error) return <div className="text-center py-20 text-xl text-red-500">{error}</div>;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar persistente */}
      <TeacherSidebar />

      <main className="flex-1 p-12">
        {/* Header */}
        <div className="bg-[#002855] text-white py-6 px-10 flex justify-between items-center shadow-lg rounded-xl mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-[#002855] text-4xl font-bold">
              D
            </div>
            <div>
              <h1 className="text-3xl font-bold">Panel Docente</h1>
              <p className="text-blue-200 text-sm">SIEPA - Simulador Saber 11°</p>
            </div>
          </div>

          <div className="text-right">
            <p className="font-medium text-lg">{user?.name}</p>
            <p className="text-blue-200 text-sm">Docente</p>
          </div>

          <button
            onClick={logout}
            className="bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl text-sm font-medium transition"
          >
            Cerrar Sesión
          </button>
        </div>

        <h2 className="text-4xl font-bold text-gray-800 mb-10">
          Bienvenido, {user?.name.split(' ')[0]}
        </h2>

        {/* Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-white rounded-3xl p-8 shadow hover:shadow-xl transition">
            <p className="text-gray-500 text-sm">Total Cursos</p>
            <p className="text-5xl font-bold text-[#0A2E57] mt-4">{dashboard?.totalCourses || 0}</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow hover:shadow-xl transition">
            <p className="text-gray-500 text-sm">Total Estudiantes</p>
            <p className="text-5xl font-bold text-[#0A2E57] mt-4">{dashboard?.totalStudents || 0}</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow hover:shadow-xl transition">
            <p className="text-gray-500 text-sm">Nivel académico</p>
            <p className="text-5xl font-bold text-[#0A2E57] mt-4">{dashboard?.averageTheta.toFixed(2) || 0}</p>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow hover:shadow-xl transition">
            <p className="text-gray-500 text-sm">Simulacros Aplicados</p>
            <p className="text-5xl font-bold text-[#0A2E57] mt-4">{dashboard?.simulacrosAplicados || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-semibold mb-4">Crear Simulacro</h3>
            <p className="text-gray-600">Arma cuadernillos personalizados con preguntas ICFES</p>
            <button className="mt-6 bg-[#002855] text-white px-8 py-3 rounded-2xl w-full">
              Nuevo Simulacro
            </button>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-semibold mb-4">Banco de Preguntas</h3>
            <p className="text-gray-600">Gestiona y crea ítems por competencia</p>
            <button className="mt-6 bg-[#002855] text-white px-8 py-3 rounded-2xl w-full">
              Ver Banco
            </button>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow hover:shadow-xl transition cursor-pointer">
            <h3 className="text-2xl font-semibold mb-4">Resultados</h3>
            <p className="text-gray-600">Revisa desempeño de tus estudiantes</p>
            <button className="mt-6 bg-[#002855] text-white px-8 py-3 rounded-2xl w-full">
              Ver Reportes
            </button>
          </div>
        </div>

        {/* ... resto del código para gráficos, estudiantes en riesgo, etc. */}
      </main>
    </div>
    
  );
}

export default TeacherDashboard;
