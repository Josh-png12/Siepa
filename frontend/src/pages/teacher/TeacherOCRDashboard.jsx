import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTeacherOCRSimulacros } from '../../services/api';

function TeacherOCRDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getTeacherOCRSimulacros();
        setItems(response.items || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar el modulo OCR');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0A2E57]">Calificacion OCR</h1>
        <p className="text-gray-600">Gestion de simulacros fisicos escaneados</p>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">Simulacro</th>
              <th className="p-3">Curso</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Hojas Recibidas</th>
              <th className="p-3">Errores</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="7">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="7">No hay simulacros fisicos para OCR.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id || item.simulacroId} className="border-b">
                  <td className="p-3">{item.simulacro || item.title}</td>
                  <td className="p-3">{item.course || item.courseName || '-'}</td>
                  <td className="p-3">{item.date ? new Date(item.date).toLocaleDateString() : '-'}</td>
                  <td className="p-3">{item.status || '-'}</td>
                  <td className="p-3">{item.sheetsReceived ?? 0}</td>
                  <td className="p-3">{item.errors ?? 0}</td>
                  <td className="p-3">
                    <Link
                      to={`/dashboard/docente/ocr/${item.id || item.simulacroId}`}
                      className="bg-[#0A2E57] text-white px-3 py-1 rounded"
                    >
                      Gestionar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default TeacherOCRDashboard;
