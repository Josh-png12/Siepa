import { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import Toast from '../../components/ui/Toast';
import { studentTokens } from './studentTokens';

function StudentProfile() {
  const { user, logout } = useAuthStore();
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });

  const onSubmitPassword = async (event) => {
    event.preventDefault();
    setToast({ type: 'info', message: 'Cambio de contrasena disponible cuando el endpoint de perfil sea habilitado.' });
  };

  return (
    <div className={studentTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <div>
        <h1 className={studentTokens.classes.title}>Perfil</h1>
        <p className={studentTokens.classes.subtitle}>Administra tus datos personales y seguridad de cuenta.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Datos basicos</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><strong>Nombre:</strong> {user?.name || '-'}</p>
            <p><strong>Email:</strong> {user?.email || '-'}</p>
            <p><strong>Rol:</strong> {user?.role || '-'}</p>
            <p><strong>Institucion:</strong> {user?.institutionId || 'default'}</p>
          </div>
        </article>

        <article className={`${studentTokens.classes.card} p-4`}>
          <h2 className="text-lg font-semibold text-[#0F2D52]">Seguridad</h2>
          <form className="mt-3 space-y-2" onSubmit={onSubmitPassword}>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Contrasena actual"
              value={form.currentPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              className={studentTokens.classes.input}
              disabled
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Nueva contrasena"
              value={form.newPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              className={studentTokens.classes.input}
              disabled
            />
            <button type="submit" className="rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-500 cursor-not-allowed" disabled>
              Cambiar contrasena
            </button>
            <p className="text-xs text-slate-500">Se habilitara cuando el endpoint seguro de perfil este disponible.</p>
          </form>
        </article>
      </section>

      <button type="button" onClick={logout} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
        Cerrar sesion
      </button>
    </div>
  );
}

export default StudentProfile;
