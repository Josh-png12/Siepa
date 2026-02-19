import { useMemo, useState } from 'react';
import EmptyState from '../ui/EmptyState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';

const getSampleQuestions = (preview) => {
  const list = preview?.questions || preview?.sample || [];
  return Array.isArray(list) ? list.slice(0, 3) : [];
};

function PdfPreviewPanel({ preview }) {
  const [isOpen, setIsOpen] = useState(true);

  const stats = useMemo(() => {
    const raw = preview?.meta?.stats || preview?.stats || {};
    const total = Number(raw.total || raw.totalQuestions || 0);
    const withAnswer = Number(raw.withAnswer || 0);
    const flagged = Number(raw.flaggedCount || raw.flaggedQuestions || 0);
    const avgConfidence = Number(raw.avgConfidence || 0);
    return { total, withAnswer, flagged, avgConfidence };
  }, [preview]);

  const warnings = preview?.meta?.warnings || preview?.warnings || [];
  const sampleQuestions = getSampleQuestions(preview);

  if (!preview) {
    return (
      <EmptyState
        title="Sin previsualizacion"
        description="Sube un PDF y presiona Previsualizar para ver preguntas detectadas."
      />
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#0A2E57]">Resultado de previsualizacion</h3>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700"
        >
          {isOpen ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Preguntas detectadas</p>
          <p className="text-xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Con respuesta</p>
          <p className="text-xl font-bold text-slate-800">{stats.withAnswer}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Con flags</p>
          <p className="text-xl font-bold text-slate-800">{stats.flagged}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Confianza promedio</p>
          <p className="text-xl font-bold text-slate-800">{stats.avgConfidence.toFixed(2)}</p>
        </div>
      </div>

      {warnings.length ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Advertencias</h4>
          {warnings.map((warning, idx) => (
            <div key={`${warning}-${idx}`} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      {isOpen ? (
        <div className="space-y-3">
          {sampleQuestions.length === 0 ? (
            <EmptyState title="Sin muestra" description="No hay preguntas para mostrar en este preview." />
          ) : (
            sampleQuestions.map((question, index) => {
              const options = question.options || {};
              const optionEntries = Array.isArray(options)
                ? options.map((item) => [item.label, item.text])
                : Object.entries(options);

              return (
                <article key={`${question.qNumber || index}-${index}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">Pregunta {question.qNumber || index + 1}</p>
                    <div className="flex gap-2">
                      {question.detectedAnswer ? <StatusBadge tone="ok" label={`Respuesta ${question.detectedAnswer}`} /> : null}
                      <StatusBadge tone="info" label={`Conf. ${Number(question.confidence || 0).toFixed(2)}`} />
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{question.statement || '(sin enunciado)'}</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {optionEntries.map(([label, text]) => (
                      <div key={`${label}-${text}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <span className="font-semibold">{label}.</span> {text}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}

export default PdfPreviewPanel;
