import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPhysicalSimulacros } from '../../../services/api';

function PhysicalSimulacrosList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await listPhysicalSimulacros();
        setItems(response.items || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar simulacros fisicos');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className="space-y-4">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">ID</th>
              <th className="p-3">Titulo</th>
              <th className="p-3">Fecha</th>
              <th className="p-3">Preguntas</th>
              <th className="p-3">Status</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="6">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="6">No hay simulacros fisicos.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item._id} className="border-b">
                  <td className="p-3">{item.simulacroPhysicalId}</td>
                  <td className="p-3">{item.title}</td>
                  <td className="p-3">{new Date(item.date).toLocaleDateString()}</td>
                  <td className="p-3">{item.questionCount}</td>
                  <td className="p-3">{item.status}</td>
                  <td className="p-3">
                    <Link to={item._id} className="bg-blue-600 text-white px-3 py-1 rounded">Gestionar</Link>
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

export default PhysicalSimulacrosList;
