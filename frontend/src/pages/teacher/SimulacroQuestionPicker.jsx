import { useEffect, useMemo, useState } from 'react';
import { createQuestion, listQuestions } from '../../services/api';
import QuestionEditorForm from './QuestionEditorForm.jsx';

function SimulacroQuestionPicker({ selectedQuestions, onChange, moduleName }) {
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState({ area: '', competencia: '', dificultadCualitativa: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showInline, setShowInline] = useState(false);
  const [saveInlineToBank, setSaveInlineToBank] = useState(true);
  const [inlineSaving, setInlineSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const params = {
          page: 1,
          limit: 30,
          sort: 'updatedAt:desc',
          estado: 'publicada'
        };

        if (filters.area) params.area = filters.area;
        if (filters.competencia) params.competencia = filters.competencia;
        if (filters.dificultadCualitativa) params.dificultadCualitativa = filters.dificultadCualitativa;

        const response = await listQuestions(params);
        setQuestions(response.items || []);
      } catch (err) {
        setError(err.response?.data?.message || 'No se pudo cargar el banco de preguntas');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [filters]);

  const selectedIds = useMemo(
    () => new Set(selectedQuestions.filter((item) => item.question).map((item) => String(item.question))),
    [selectedQuestions]
  );

  const normalizeOrder = (list) => list.map((item, index) => ({ ...item, order: index + 1 }));

  const questionTextMap = useMemo(() => {
    const map = new Map();
    questions.forEach((question) => {
      map.set(String(question._id), question.statement?.text || question.latex || '(sin texto)');
    });
    return map;
  }, [questions]);

  const toggleQuestion = (question) => {
    const questionId = String(question._id);
    const isSelected = selectedIds.has(questionId);

    if (isSelected) {
      const filtered = selectedQuestions.filter((item) => String(item.question || '') !== questionId);
      onChange(normalizeOrder(filtered));
      return;
    }

    onChange(
      normalizeOrder([
        ...selectedQuestions,
        {
          question: questionId,
          embeddedQuestion: null,
          order: selectedQuestions.length + 1
        }
      ])
    );
  };

  const removeSelected = (index) => {
    const next = selectedQuestions.filter((_, idx) => idx !== index);
    onChange(normalizeOrder(next));
  };

  const moveSelected = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= selectedQuestions.length) return;

    const next = [...selectedQuestions];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;

    onChange(normalizeOrder(next));
  };

  const onInlineSubmit = async (formData) => {
    try {
      setInlineSaving(true);
      setError('');

      if (saveInlineToBank) {
        const response = await createQuestion(formData);
        const questionId = response.question?._id;

        if (!questionId) {
          throw new Error('No se pudo crear la pregunta inline');
        }

        onChange(
          normalizeOrder([
            ...selectedQuestions,
            { question: String(questionId), embeddedQuestion: null, order: selectedQuestions.length + 1 }
          ])
        );
      } else {
        const payloadRaw = formData.get('payload');
        if (!payloadRaw) {
          throw new Error('No se encontro payload de pregunta inline');
        }

        const statementImages = formData.getAll('statementImages');
        const hasFiles = statementImages.length > 0 || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].some((label) => formData.get(`optionImage${label}`));

        if (hasFiles) {
          throw new Error('Si no guardas en banco, no se permiten imagenes nuevas en inline creator');
        }

        const embeddedQuestion = JSON.parse(String(payloadRaw));

        onChange(
          normalizeOrder([
            ...selectedQuestions,
            {
              question: null,
              embeddedQuestion,
              order: selectedQuestions.length + 1
            }
          ])
        );
      }

      setShowInline(false);
      setSaveInlineToBank(true);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'No se pudo agregar pregunta inline');
    } finally {
      setInlineSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div> : null}

      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <h3 className="text-lg font-semibold text-[#0A2E57]">Banco de Preguntas - {moduleName}</h3>
          <button
            type="button"
            onClick={() => setShowInline((prev) => !prev)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg"
          >
            {showInline ? 'Cerrar inline' : 'Nueva pregunta inline'}
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <input
            placeholder="Area"
            value={filters.area}
            onChange={(event) => setFilters((prev) => ({ ...prev, area: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
          <input
            placeholder="Competencia"
            value={filters.competencia}
            onChange={(event) => setFilters((prev) => ({ ...prev, competencia: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
          <select
            value={filters.dificultadCualitativa}
            onChange={(event) => setFilters((prev) => ({ ...prev, dificultadCualitativa: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          >
            <option value="">Dificultad</option>
            <option value="baja">baja</option>
            <option value="media">media</option>
            <option value="alta">alta</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando preguntas...</p>
        ) : (
          <div className="max-h-72 overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-2 text-left">Sel</th>
                  <th className="p-2 text-left">Pregunta</th>
                  <th className="p-2 text-left">Area</th>
                  <th className="p-2 text-left">Comp.</th>
                  <th className="p-2 text-left">b</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => {
                  const checked = selectedIds.has(String(question._id));
                  return (
                    <tr key={question._id} className="border-b align-top">
                      <td className="p-2">
                        <input type="checkbox" checked={checked} onChange={() => toggleQuestion(question)} />
                      </td>
                      <td className="p-2 max-w-lg">{question.statement?.text || question.latex || '(sin texto)'}</td>
                      <td className="p-2">{question.area}</td>
                      <td className="p-2">{question.competencia}</td>
                      <td className="p-2">{Number(question.triParams?.b ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showInline ? (
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <h4 className="text-lg font-semibold text-[#0A2E57]">Pregunta Inline</h4>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveInlineToBank}
              onChange={(event) => setSaveInlineToBank(event.target.checked)}
            />
            Guardar en banco
          </label>

          <QuestionEditorForm
            submitLabel={inlineSaving ? 'Agregando...' : 'Agregar pregunta al modulo'}
            submitting={inlineSaving}
            serverError=""
            onSubmit={onInlineSubmit}
            onCancel={() => setShowInline(false)}
          />
        </div>
      ) : null}

      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <h3 className="text-lg font-semibold text-[#0A2E57]">Seleccionadas ({selectedQuestions.length})</h3>

        {selectedQuestions.length === 0 ? (
          <p className="text-sm text-gray-500">Aun no hay preguntas en este modulo.</p>
        ) : (
          <div className="space-y-2">
            {selectedQuestions.map((item, index) => (
              <div key={`${item.question || item.embeddedQuestion?.statement?.text || 'embedded'}-${index}`} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">#{index + 1}</p>
                  <p className="text-sm text-gray-700">
                    {item.question
                      ? questionTextMap.get(String(item.question)) || `Pregunta banco: ${item.question}`
                      : item.embeddedQuestion?.statement?.text || item.embeddedQuestion?.latex || '(inline sin texto)'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => moveSelected(index, -1)} className="px-2 py-1 bg-gray-200 rounded">Up</button>
                  <button type="button" onClick={() => moveSelected(index, 1)} className="px-2 py-1 bg-gray-200 rounded">Down</button>
                  <button type="button" onClick={() => removeSelected(index)} className="px-2 py-1 bg-red-600 text-white rounded">Quitar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SimulacroQuestionPicker;
