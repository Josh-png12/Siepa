import { useEffect, useState } from 'react';

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt';

function UploadMaterialModal({
  open,
  onClose,
  onSubmit,
  submitting,
  initialData = null
}) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    area: '',
    competencia: '',
    thetaTarget: '',
    isMandatory: false,
    tags: '',
    file: null
  });

  useEffect(() => {
    if (!open) return;

    setForm({
      title: initialData?.title || '',
      description: initialData?.description || '',
      area: initialData?.area || '',
      competencia: initialData?.competencia || '',
      thetaTarget: initialData?.thetaTarget ?? '',
      isMandatory: Boolean(initialData?.isMandatory),
      tags: Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : '',
      file: null
    });
  }, [open, initialData]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();

    if (!form.title.trim()) return;
    if (!initialData && !form.file) return;

    const formData = new FormData();
    formData.append('title', form.title.trim());
    formData.append('description', form.description.trim());
    formData.append('area', form.area.trim());
    formData.append('competencia', form.competencia.trim());
    formData.append('thetaTarget', form.thetaTarget === '' ? '' : String(form.thetaTarget));
    formData.append('isMandatory', String(Boolean(form.isMandatory)));

    const parsedTags = form.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    parsedTags.forEach((tag) => formData.append('tags', tag));

    if (form.file) {
      formData.append('file', form.file);
    }

    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-lg">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#0A2E57]">{initialData ? 'Editar material' : 'Subir material'}</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900">X</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <input
              required
              placeholder="Titulo"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
            <input
              placeholder="Area"
              value={form.area}
              onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
          </div>

          <textarea
            placeholder="Descripcion"
            rows="3"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="w-full border rounded-lg px-3 py-2"
          />

          <div className="grid md:grid-cols-3 gap-3">
            <input
              placeholder="Competencia"
              value={form.competencia}
              onChange={(event) => setForm((prev) => ({ ...prev, competencia: event.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
            <input
              type="number"
              min="-3"
              max="3"
              step="0.1"
              placeholder="Theta Target"
              value={form.thetaTarget}
              onChange={(event) => setForm((prev) => ({ ...prev, thetaTarget: event.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
            <input
              placeholder="Tags (coma)"
              value={form.tags}
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              className="border rounded-lg px-3 py-2"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isMandatory}
              onChange={(event) => setForm((prev) => ({ ...prev, isMandatory: event.target.checked }))}
            />
            Material obligatorio
          </label>

          <div>
            <label className="text-sm font-medium block mb-1">Archivo</label>
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={(event) => setForm((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
              className="w-full border rounded-lg px-3 py-2"
            />
            {initialData ? <p className="text-xs text-gray-500 mt-1">Opcional para editar. Si no seleccionas archivo, se mantiene el actual.</p> : null}
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg">Cancelar</button>
            <button type="submit" disabled={submitting} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
              {submitting ? 'Guardando...' : initialData ? 'Actualizar' : 'Subir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UploadMaterialModal;
