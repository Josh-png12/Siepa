function ErrorState({
  title = 'No se pudo cargar',
  description = 'Intenta nuevamente en unos segundos.',
  actionLabel = '',
  onAction
}) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <h3 className="text-base font-semibold text-red-700">{title}</h3>
      <p className="mt-2 text-sm text-red-600">{description}</p>
      {actionLabel && typeof onAction === 'function' ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export default ErrorState;
