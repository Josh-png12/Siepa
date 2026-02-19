function Toast({ type = 'success', message = '', onClose }) {
  if (!message) return null;

  const palette = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200'
  };

  return (
    <div className={`fixed top-6 right-6 z-50 border rounded-xl shadow-lg px-4 py-3 ${palette[type] || palette.info}`}>
      <div className="flex items-center gap-3">
        <p className="text-sm font-medium">{message}</p>
        <button type="button" onClick={onClose} className="text-xs underline">Cerrar</button>
      </div>
    </div>
  );
}

export default Toast;
