import { useEffect, useMemo, useState } from 'react';

function ResetPasswordModal({ isOpen, user, loading = false, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (password.length < 6) return false;
    if (password !== confirmPassword) return false;
    return true;
  }, [password, confirmPassword, loading]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      if (password !== confirmPassword) setError('Las contraseñas no coinciden');
      else if (password.length < 6) setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setError('');
    await onSubmit(password);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h3 className="text-lg font-semibold text-[#0A2E57]">Reset Password</h3>
        <p className="text-sm text-slate-600">
          {`Usuario: ${user?.name || ''} (${user?.email || ''})`}
        </p>
        {error ? <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div> : null}
        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Nueva contraseña"
            className="w-full border rounded-lg px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            className="w-full border rounded-lg px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-slate-200 text-slate-700 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg bg-[#0A2E57] text-white disabled:opacity-60"
            >
              {loading ? 'Guardando...' : 'Confirmar reset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ResetPasswordModal;
