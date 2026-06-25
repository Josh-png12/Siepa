import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createManualSimulacro,
  deleteTeacherSimulacro,
  listQuestions,
  listTeacherSimulacros,
  publishTeacherSimulacro
} from '../../services/api';

function countQuestions(modules = []) {
  return modules.reduce((acc, moduleItem) => acc + (moduleItem.questions?.length || 0), 0);
}

function SimulacrosList() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState({ estado: '', page: 1, limit: 20 });
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [bankEmpty, setBankEmpty] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const params = useMemo(() => {
    const p = { page: filters.page, limit: filters.limit };
    if (filters.estado) p.estado = filters.estado;
    return p;
  }, [filters]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await listTeacherSimulacros(params);
        setData(response.items || []);
        setPagination(response.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudieron cargar los simulacros');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [params]);

  const changePage = (nextPage) => {
    setFilters((prev) => ({ ...prev, page: nextPage }));
  };

  const onDelete = async (id) => {
    const confirmed = window.confirm('Esta accion eliminara el simulacro de forma permanente.');
    if (!confirmed) return;

    try {
      setActionId(id);
      setError('');
      setSuccess('');
      await deleteTeacherSimulacro(id);
      setData((prev) => prev.filter((item) => item.id !== id));
      setSuccess('Simulacro eliminado correctamente.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el simulacro');
    } finally {
      setActionId('');
    }
  };

  const onPublish = async (id) => {
    const confirmed = window.confirm('Deseas publicar este simulacro?');
    if (!confirmed) return;

    try {
      setActionId(id);
      setError('');
      setSuccess('');
      const response = await publishTeacherSimulacro(id);
      setData((prev) => prev.map((item) => (item.id === id ? response.simulacro : item)));
      setSuccess('Simulacro publicado correctamente.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar el simulacro');
    } finally {
      setActionId('');
    }
  };

  const onQuickTest = async () => {
    try {
      setQuickLoading(true);
      setError('');
      setSuccess('');
      setBankEmpty(false);

      const bank = await listQuestions({ page: 1, limit: 1, sort: 'updatedAt:desc' });
      const firstQuestion = bank.items?.[0];
      if (!firstQuestion) {
        setBankEmpty(true);
        return;
      }

      const ts = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      const created = await createManualSimulacro({
        title: `⚡ Prueba rápida (${ts})`,
        globalTimeLimit: 30,
        modules: [{
          name: 'Lectura',
          timeLimit: 30,
          questions: [{ question: firstQuestion.id, order: 1 }]
        }]
      });

      await publishTeacherSimulacro(created.simulacro.id);
      navigate(created.simulacro.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al crear prueba rápida');
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Simulacros ICFES</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('crear')} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg">
            + Manual
          </button>
          <button onClick={() => navigate('auto-crear')} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            + Inteligente
          </button>
          <button
            onClick={onQuickTest}
            disabled={quickLoading}
            title="Solo para testing — crea un simulacro de 1 pregunta y lo publica al instante"
            className="border border-amber-400 text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {quickLoading ? '...' : '⚡ Prueba rápida'}
          </button>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={filters.estado}
            onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value, page: 1 }))}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">Estado</option>
            <option value="borrador">borrador</option>
            <option value="publicado">publicado</option>
            <option value="cerrado">cerrado</option>
          </select>
          <select
            value={filters.limit}
            onChange={(event) => setFilters((prev) => ({ ...prev, limit: Number(event.target.value), page: 1 }))}
            className="border rounded-lg px-3 py-2"
          >
            <option value="10">10 por pagina</option>
            <option value="20">20 por pagina</option>
            <option value="50">50 por pagina</option>
          </select>
        </div>
      </section>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div> : null}
      {bankEmpty ? (
        <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <p className="text-amber-800 text-sm">
            No hay preguntas en el banco. Crea al menos una pregunta primero para poder usar la prueba rápida.
          </p>
          <button
            onClick={() => navigate('../preguntas/nueva')}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
          >
            Crear pregunta
          </button>
        </div>
      ) : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">Titulo</th>
              <th className="p-3">Modulos</th>
              <th className="p-3">Preguntas</th>
              <th className="p-3">Tiempo global</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="6">Cargando...</td></tr>
            ) : data.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="6">No hay simulacros.</td></tr>
            ) : (
              data.map((simulacro) => {
                const inAction = actionId === simulacro.id;
                return (
                  <tr key={simulacro.id} className="border-b">
                    <td className="p-3">{simulacro.title}</td>
                    <td className="p-3">{(simulacro.modules || []).map((moduleItem) => moduleItem.name).join(', ') || '-'}</td>
                    <td className="p-3">{countQuestions(simulacro.modules)}</td>
                    <td className="p-3">{simulacro.globalTimeLimit || '-'} min</td>
                    <td className="p-3">{simulacro.estado}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => navigate(`${simulacro.id}`)} className="bg-blue-600 text-white px-3 py-1 rounded" disabled={inAction}>Ver</button>
                        <button onClick={() => navigate(`${simulacro.id}/resultados`)} className="bg-indigo-600 text-white px-3 py-1 rounded" disabled={inAction}>Resultados</button>
                        {simulacro.estado === 'borrador' ? (
                          <>
                            <button onClick={() => onPublish(simulacro.id)} className="bg-emerald-600 text-white px-3 py-1 rounded" disabled={inAction}>Publicar</button>
                            <button onClick={() => onDelete(simulacro.id)} className="bg-red-600 text-white px-3 py-1 rounded" disabled={inAction}>Eliminar</button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">Total: {pagination.total} | Pagina {pagination.page} de {pagination.totalPages || 1}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => changePage(Math.max(1, pagination.page - 1))}
            disabled={pagination.page <= 1 || loading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >Anterior</button>
          <button
            type="button"
            onClick={() => changePage(Math.min(pagination.totalPages || 1, pagination.page + 1))}
            disabled={pagination.page >= (pagination.totalPages || 1) || loading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >Siguiente</button>
        </div>
      </div>
    </div>
  );
}

export default SimulacrosList;
