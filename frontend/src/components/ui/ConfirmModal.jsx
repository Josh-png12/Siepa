function ConfirmModal({
  isOpen,
  title = 'Confirmar accion',
  description = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold text-[#0A2E57]">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-lg bg-[#0A2E57] text-white">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
