import { useEffect, useMemo, useState } from 'react';

function OCRReviewModal({
  open,
  sheet,
  onClose,
  onSave,
  saving = false
}) {
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    if (!open) return;
    setAnswers(Array.isArray(sheet?.parsedResponses) ? sheet.parsedResponses : []);
  }, [open, sheet]);

  const errorCount = useMemo(
    () => answers.filter((answer) => answer.status && answer.status !== 'valid').length,
    [answers]
  );

  if (!open || !sheet) return null;

  const setSelected = (index, selected) => {
    setAnswers((prev) => prev.map((item, idx) => (idx === index ? { ...item, selected } : item)));
  };

  const submit = () => {
    onSave?.({
      sheetId: sheet.id,
      corrections: answers
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[#0A2E57]">Revision OCR - {sheet.studentName}</h3>
            <p className="text-xs text-gray-500">Errores detectados: {errorCount}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900">X</button>
        </div>

        <div className="grid lg:grid-cols-[1fr_1fr] gap-0 flex-1 min-h-0">
          <div className="p-4 border-r overflow-auto bg-gray-50">
            <h4 className="font-semibold mb-3">Vista escaneo</h4>
            <div className="border rounded-xl bg-white p-2">
              {sheet.previewUrl ? (
                <img src={sheet.previewUrl} alt="scan-preview" className="w-full h-auto rounded" />
              ) : (
                <div className="h-80 flex items-center justify-center text-sm text-gray-500">Preview no disponible</div>
              )}
            </div>
          </div>

          <div className="p-4 overflow-auto">
            <h4 className="font-semibold mb-3">Respuestas detectadas</h4>
            <div className="space-y-2">
              {answers.map((answer, index) => (
                <div key={`${answer.question}-${index}`} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">Pregunta {answer.question}</p>
                    <p className="text-xs text-gray-500">Status: {answer.status || 'valid'}</p>
                  </div>

                  <select
                    value={answer.selected || ''}
                    onChange={(event) => setSelected(index, event.target.value || null)}
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="">BLANK</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                    <option value="E">E</option>
                    <option value="F">F</option>
                    <option value="G">G</option>
                    <option value="H">H</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg">Cancelar</button>
          <button type="button" onClick={submit} disabled={saving} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar correccion'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OCRReviewModal;
