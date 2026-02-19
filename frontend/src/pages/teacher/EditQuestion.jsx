import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getQuestion,
  getQuestionVersions,
  restoreQuestionVersion,
  updateQuestion
} from '../../services/api';
import QuestionEditorForm from './QuestionEditorForm.jsx';

function EditQuestion() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState('');
  const [question, setQuestion] = useState(null);
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState('');
  const [versionMessage, setVersionMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoadingQuestion(true);
      setError('');
      const [questionResponse, versionsResponse] = await Promise.all([
        getQuestion(id),
        getQuestionVersions(id)
      ]);

      setQuestion(questionResponse.question);
      setVersions(versionsResponse.versions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la pregunta');
    } finally {
      setLoadingQuestion(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (formData) => {
    try {
      setSaving(true);
      setError('');
      await updateQuestion(id, formData);
      await loadData();
      setVersionMessage('Cambios guardados correctamente.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar la pregunta');
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (versionId) => {
    try {
      setRestoringVersionId(versionId);
      setVersionMessage('');
      setError('');
      await restoreQuestionVersion(id, versionId);
      await loadData();
      setVersionMessage('Version restaurada correctamente.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo restaurar la version');
    } finally {
      setRestoringVersionId('');
    }
  };

  if (loadingQuestion) {
    return <div className="bg-white p-6 rounded-2xl shadow">Cargando pregunta...</div>;
  }

  if (!question) {
    return <div className="bg-red-50 text-red-700 p-4 rounded-lg">Pregunta no encontrada.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-[#0A2E57]">Editar Pregunta</h1>
        <button
          type="button"
          onClick={() => navigate('/dashboard/docente/preguntas')}
          className="bg-gray-200 px-4 py-2 rounded-lg"
        >
          Volver al listado
        </button>
      </div>

      {versionMessage ? (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {versionMessage}
        </div>
      ) : null}

      <QuestionEditorForm
        initialData={question}
        submitLabel="Guardar cambios"
        submitting={saving}
        serverError={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/dashboard/docente/preguntas')}
      />

      <section className="bg-white rounded-2xl shadow p-6 space-y-3">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Historial de versiones</h2>
        {versions.length === 0 ? (
          <p className="text-gray-500">No hay versiones registradas.</p>
        ) : (
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={version._id} className="border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Version {version.versionNumber} - {version.changeType}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(version.createdAt).toLocaleString()} - {version.changedBy?.name || 'Usuario'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(version._id)}
                  disabled={restoringVersionId === version._id}
                  className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-60"
                >
                  {restoringVersionId === version._id ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default EditQuestion;
