import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQuestion } from '../../services/api';
import QuestionEditorForm from './QuestionEditorForm.jsx';

function CreateQuestion() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (formData) => {
    try {
      setLoading(true);
      setError('');
      await createQuestion(formData);
      navigate('/dashboard/docente/preguntas');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear la pregunta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-[#0A2E57]">Crear Pregunta</h1>

      <QuestionEditorForm
        submitLabel="Guardar pregunta"
        submitting={loading}
        serverError={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/dashboard/docente/preguntas')}
      />
    </div>
  );
}

export default CreateQuestion;
