import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTeacherSimulacro, updateTeacherSimulacro } from '../../services/api';

function countQuestions(modules = []) {
  return modules.reduce((acc, moduleItem) => acc + (moduleItem.questions?.length || 0), 0);
}

function SimulacroDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [simulacro, setSimulacro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getTeacherSimulacro(id);
      setSimulacro(response.simulacro);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar el simulacro');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const moveQuestion = (moduleName, index, direction) => {
    if (!simulacro) return;

    setSimulacro((prev) => {
      const nextModules = (prev.modules || []).map((moduleItem) => {
        if (moduleItem.name !== moduleName) return moduleItem;

        const questions = [...(moduleItem.questions || [])];
        const target = index + direction;
        if (target < 0 || target >= questions.length) return moduleItem;

        const temp = questions[index];
        questions[index] = questions[target];
        questions[target] = temp;

        return {
          ...moduleItem,
          questions: questions.map((item, idx) => ({ ...item, order: idx + 1 }))
        };
      });

      return { ...prev, modules: nextModules };
    });
  };

  const saveOrder = async () => {
    if (!simulacro) return;

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await updateTeacherSimulacro(simulacro.id, {
        modules: (simulacro.modules || []).map((moduleItem) => ({
          name: moduleItem.name,
          timeLimit: moduleItem.timeLimit || null,
          questions: (moduleItem.questions || []).map((questionItem, idx) => ({
            question: questionItem.question?.id || null,
            embeddedQuestion: questionItem.embeddedQuestion || null,
            order: idx + 1
          }))
        }))
      });

      setSuccess('Orden de preguntas actualizado.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el nuevo orden');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white p-6 rounded-2xl shadow">Cargando simulacro...</div>;
  }

  if (!simulacro) {
    return <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">Simulacro no encontrado.</div>;
  }

  const editable = simulacro.estado === 'borrador';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">{simulacro.title}</h1>
          <p className="text-gray-600">{simulacro.description || 'Sin descripcion'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/dashboard/docente/simulacros')} className="bg-gray-200 px-4 py-2 rounded-lg">Volver</button>
          <button onClick={() => navigate(`${simulacro.id}/resultados`)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">
            Ver resultados
          </button>
        </div>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{success}</div> : null}

      <section className="bg-white rounded-2xl shadow p-6 grid md:grid-cols-4 gap-4">
        <div><span className="font-semibold">Estado:</span> {simulacro.estado}</div>
        <div><span className="font-semibold">Tiempo global:</span> {simulacro.globalTimeLimit || '-'} min</div>
        <div><span className="font-semibold">Modo examen:</span> {simulacro.strictMode ? 'Sí' : 'No'}</div>
        <div><span className="font-semibold">Preguntas:</span> {countQuestions(simulacro.modules)}</div>
      </section>

      {(simulacro.modules || []).map((moduleItem) => (
        <section key={moduleItem.name} className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold text-[#0A2E57]">
            {moduleItem.name} ({moduleItem.questions?.length || 0})
            {moduleItem.timeLimit ? ` - ${moduleItem.timeLimit} min` : ''}
          </h2>

          {(moduleItem.questions || []).map((item, index) => (
            <div key={`${item.question?.id || 'embedded'}-${index}`} className="border rounded-lg p-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">#{index + 1}</p>
                <p className="text-sm text-gray-700">
                  {item.question
                    ? item.question.statementText || item.question.statement?.text || item.question.latex || '(sin texto)'
                    : item.embeddedQuestion?.statementText || item.embeddedQuestion?.statement?.text || item.embeddedQuestion?.latex || '(inline sin texto)'}
                </p>
              </div>

              {editable ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveQuestion(moduleItem.name, index, -1)} className="px-2 py-1 bg-gray-200 rounded">Subir</button>
                  <button type="button" onClick={() => moveQuestion(moduleItem.name, index, 1)} className="px-2 py-1 bg-gray-200 rounded">Bajar</button>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ))}

      {editable ? (
        <button type="button" onClick={saveOrder} disabled={saving} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
          {saving ? 'Guardando...' : 'Guardar orden'}
        </button>
      ) : null}
    </div>
  );
}

export default SimulacroDetail;
