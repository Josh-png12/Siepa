import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteQuestion,
  importQuestionsBatch,
  listQuestions,
  publishQuestion
} from '../../services/api';
import AIGenerateModal from './AIGenerateModal.jsx';
import QuestionFilters from './QuestionFilters.jsx';

const defaultFilters = {
  area: '',
  competencia: '',
  dificultadCualitativa: '',
  bMin: '',
  bMax: '',
  calibrationStatus: '',
  visibility: '',
  creator: '',
  sort1: 'updatedAt:desc',
  sort2: '',
  sort: 'updatedAt:desc',
  page: 1,
  limit: '20'
};

const defaultMapping = {
  statementText: 'statementText',
  latex: 'latex',
  area: 'area',
  competencia: 'competencia',
  nivelCognitivo: 'nivelCognitivo',
  dificultadCualitativa: 'dificultadCualitativa',
  triA: 'triA',
  triB: 'triB',
  triC: 'triC',
  visibility: 'visibility',
  calibrationStatus: 'calibrationStatus',
  correctAnswer: 'correctAnswer',
  optionA: 'optionA',
  optionB: 'optionB',
  optionC: 'optionC',
  optionD: 'optionD',
  optionE: 'optionE',
  optionF: 'optionF',
  optionG: 'optionG',
  optionH: 'optionH'
};

function QuestionsList() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(defaultFilters);
  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState('');

  const [importFile, setImportFile] = useState(null);
  const [mappingText, setMappingText] = useState(JSON.stringify(defaultMapping, null, 2));
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const queryParams = useMemo(() => {
    const params = {
      page: filters.page,
      limit: filters.limit,
      sort: filters.sort
    };

    [
      'area',
      'competencia',
      'dificultadCualitativa',
      'bMin',
      'bMax',
      'calibrationStatus',
      'visibility',
      'creator'
    ].forEach((key) => {
      if (filters[key] !== '') {
        params[key] = filters[key];
      }
    });

    return params;
  }, [filters]);

  const loadQuestions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await listQuestions(queryParams);
      setQuestions(response.items || []);
      setPagination(response.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar el banco de preguntas');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const onApplyFilters = (nextFilters) => {
    setFilters((prev) => ({ ...prev, ...nextFilters, page: 1 }));
  };

  const onResetFilters = (nextBase) => {
    setFilters({ ...defaultFilters, ...nextBase, page: 1, sort: 'updatedAt:desc' });
  };

  const movePage = (page) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const onDelete = async (id) => {
    const confirmed = window.confirm('Esta accion eliminara la pregunta de forma permanente.');
    if (!confirmed) return;

    try {
      setActionId(id);
      await deleteQuestion(id);
      await loadQuestions();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar la pregunta');
    } finally {
      setActionId('');
    }
  };

  const onPublish = async (id) => {
    try {
      setActionId(id);
      await publishQuestion(id);
      await loadQuestions();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo publicar la pregunta');
    } finally {
      setActionId('');
    }
  };

  const parseMapping = () => {
    try {
      return JSON.parse(mappingText || '{}');
    } catch (_error) {
      throw new Error('El JSON de mapeo es invalido.');
    }
  };

  const runImport = async (preview) => {
    if (!importFile) {
      setError('Selecciona un archivo .xlsx o .csv para importar.');
      return;
    }

    try {
      setImportLoading(true);
      setError('');

      const mapping = parseMapping();
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('preview', String(preview));
      formData.append('mapping', JSON.stringify(mapping));

      const response = await importQuestionsBatch(formData);
      setImportResult(response);

      if (!preview) {
        await loadQuestions();
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'No se pudo importar el archivo');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {aiModalOpen && (
        <AIGenerateModal
          onClose={() => setAiModalOpen(false)}
          onQuestionAdded={loadQuestions}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Banco de Preguntas</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <span>✨</span> Generar con IA
          </button>
          <button
            onClick={() => navigate('/dashboard/docente/preguntas/nueva')}
            className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg"
          >
            Nueva pregunta
          </button>
        </div>
      </div>

      <QuestionFilters value={filters} onApply={onApplyFilters} onReset={onResetFilters} loading={loading} />

      <section className="bg-white rounded-2xl shadow p-6 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Importación masiva (CSV/XLSX)</h2>

        <input type="file" accept=".csv,.xlsx" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />

        <label className="block text-sm font-medium">Mapeo de columnas (JSON)</label>
        <textarea
          value={mappingText}
          onChange={(event) => setMappingText(event.target.value)}
          rows="8"
          className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
        />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => runImport(true)}
            disabled={importLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {importLoading ? 'Procesando...' : 'Previsualizar'}
          </button>
          <button
            type="button"
            onClick={() => runImport(false)}
            disabled={importLoading}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {importLoading ? 'Procesando...' : 'Importar'}
          </button>
        </div>

        {importResult ? (
          <div className="border rounded-lg p-3 space-y-2 text-sm">
            <p>Total filas: {importResult.totalRows}</p>
            <p>Filas validas: {importResult.validRows ?? 0}</p>
            <p>Insertadas: {importResult.insertedCount ?? 0}</p>

            {Array.isArray(importResult.errors) && importResult.errors.length > 0 ? (
              <div className="text-red-700">
                <p className="font-semibold">Errores:</p>
                {importResult.errors.slice(0, 10).map((item) => (
                  <p key={`${item.row}-${item.message}`}>Fila {item.row}: {item.message}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      ) : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-50">
              <th className="p-4">Enunciado</th>
              <th className="p-4">Área</th>
              <th className="p-4">Competencia</th>
              <th className="p-4">Dificultad</th>
              <th className="p-4">Visibilidad</th>
              <th className="p-4">Estado</th>
              <th className="p-4">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4" colSpan="7">Cargando preguntas...</td>
              </tr>
            ) : questions.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-500" colSpan="7">No hay preguntas para mostrar.</td>
              </tr>
            ) : (
              questions.map((question) => {
                const busy = actionId === question.id;
                return (
                  <tr key={question.id} className="border-b">
                    <td className="p-4 max-w-md">
                      <p className="line-clamp-2">{question.statementText || question.latex || '(sin texto)'}</p>
                    </td>
                    <td className="p-4">{question.area}</td>
                    <td className="p-4">{question.competencia}</td>
                    <td className="p-4">{question.dificultadCualitativa}</td>
                    <td className="p-4">{question.visibility}</td>
                    <td className="p-4">{question.estado}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/docente/preguntas/${question.id}/editar`)}
                          className="bg-blue-600 text-white px-3 py-1 rounded"
                          disabled={busy}
                        >
                          Editar
                        </button>
                        {question.estado !== 'publicada' ? (
                          <button
                            type="button"
                            onClick={() => onPublish(question.id)}
                            className="bg-emerald-600 text-white px-3 py-1 rounded"
                            disabled={busy}
                          >
                            Publicar
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDelete(question.id)}
                          className="bg-red-600 text-white px-3 py-1 rounded"
                          disabled={busy}
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
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Total: {pagination.total} | Pagina {pagination.page} de {pagination.totalPages}
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => movePage(Math.max(1, pagination.page - 1))}
            disabled={pagination.page <= 1 || loading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => movePage(Math.min(pagination.totalPages || 1, pagination.page + 1))}
            disabled={pagination.page >= pagination.totalPages || loading}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuestionsList;
