import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteQuestion, listQuestions, publishQuestion } from '../../services/api';
import QuestionFilters from './QuestionFilters.jsx';

const emptyFilters = {
  area: '',
  competencia: '',
  dificultad: '',
  creador: '',
  institucional: ''
};

function ListQuestions() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [error, setError] = useState('');

  const fetchQuestions = useCallback(async (activeFilters = filters) => {
    try {
      setLoading(true);
      setError('');
      const params = Object.fromEntries(
        Object.entries(activeFilters).filter(([, value]) => value !== '')
      );
      const response = await listQuestions(params);
      setQuestions(response.items || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar las preguntas');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchQuestions(filters);
  }, [fetchQuestions, filters]);

  const handleApplyFilters = (nextFilters) => {
    setFilters(nextFilters);
  };

  const handleResetFilters = () => {
    setFilters(emptyFilters);
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Esta accion eliminara la pregunta de forma permanente. Continuar?');
    if (!confirmed) return;

    try {
      setActionLoadingId(id);
      await deleteQuestion(id);
      setQuestions((prev) => prev.filter((question) => question.id !== id));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar la pregunta');
    } finally {
      setActionLoadingId('');
    }
  };

  const handlePublish = async (id) => {
    try {
      setActionLoadingId(id);
      const response = await publishQuestion(id);
      setQuestions((prev) =>
        prev.map((question) => (question.id === id ? response.question : question))
      );
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar la pregunta');
    } finally {
      setActionLoadingId('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Banco de Preguntas</h1>
        <button
          onClick={() => navigate('/dashboard/docente/preguntas/nueva')}
          className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg"
        >
          Nueva Pregunta
        </button>
      </div>

      <QuestionFilters
        value={filters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        loading={loading}
      />

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="bg-white p-6 rounded-2xl shadow">Cargando preguntas...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b bg-gray-50">
                <th className="p-4">Enunciado</th>
                <th className="p-4">Area</th>
                <th className="p-4">Competencia</th>
                <th className="p-4">Dificultad</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Visibilidad</th>
                <th className="p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {questions.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-500" colSpan="7">
                    No hay preguntas para mostrar.
                  </td>
                </tr>
              ) : (
                questions.map((question) => {
                  const inAction = actionLoadingId === question.id;
                  return (
                    <tr key={question.id} className="border-b">
                      <td className="p-4 max-w-lg">
                        <p className="line-clamp-2">{question.statementText}</p>
                      </td>
                      <td className="p-4">{question.area}</td>
                      <td className="p-4">{question.competencia}</td>
                      <td className="p-4">{question.dificultadCualitativa}</td>
                      <td className="p-4">{question.estado}</td>
                      <td className="p-4">{question.visibility}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => navigate(`/dashboard/docente/preguntas/${question.id}/editar`)}
                            className="bg-blue-600 text-white px-3 py-1 rounded"
                            disabled={inAction}
                          >
                            Editar
                          </button>
                          {question.estado !== 'publicada' ? (
                            <button
                              onClick={() => handlePublish(question.id)}
                              className="bg-emerald-600 text-white px-3 py-1 rounded"
                              disabled={inAction}
                            >
                              Publicar
                            </button>
                          ) : null}
                          <button
                            onClick={() => handleDelete(question.id)}
                            className="bg-red-600 text-white px-3 py-1 rounded"
                            disabled={inAction}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ListQuestions;
