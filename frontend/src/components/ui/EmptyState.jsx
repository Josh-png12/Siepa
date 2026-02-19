function EmptyState({
  title = 'Sin datos',
  description = 'No hay informacion para mostrar.',
  actionLabel = '',
  onAction
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
      <h3 className="text-lg font-semibold text-[#0A2E57]">{title}</h3>
      <p className="text-sm text-slate-600 mt-1">{description}</p>
      {actionLabel && typeof onAction === 'function' ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-lg bg-[#0A2E57] text-white text-sm"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default EmptyState;
