import { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import Toast from '../../components/ui/Toast';

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

const ROLE_LABELS = {
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administrador',
};

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-base">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

function StudentProfile() {
  const { user, logout } = useAuthStore();
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });

  const onSubmitPassword = (event) => {
    event.preventDefault();
    setToast({
      type: 'info',
      message: 'El cambio de contraseña estará disponible próximamente.',
    });
  };

  const initials = getInitials(user?.name);
  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'Usuario';

  // Show school name if available, fall back to schoolId (trimmed), or 'default'
  const institution = user?.schoolName || user?.schoolId || 'Institución principal';

  return (
    <div className="space-y-6">
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ type: 'info', message: '' })}
      />

      {/* Header banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#1e3a5f] to-[#2563eb] p-6 text-white shadow-md">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className="shrink-0 h-16 w-16 rounded-full bg-gradient-to-br from-blue-300 to-indigo-500 flex items-center justify-center shadow-lg border-4 border-white/30 text-2xl font-black text-white select-none">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-xl font-black truncate">{user?.name || 'Estudiante'}</p>
            <p className="text-blue-200 text-sm truncate">{user?.email || ''}</p>
            <span className="mt-1 inline-block text-[11px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full">
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        {/* Basic data */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-2">Datos de la cuenta</h2>
          <InfoRow icon="👤" label="Nombre completo" value={user?.name} />
          <InfoRow icon="✉️" label="Correo electrónico" value={user?.email} />
          <InfoRow icon="🎓" label="Rol" value={roleLabel} />
          <InfoRow icon="🏫" label="Institución" value={institution} />
        </article>

        {/* Security */}
        <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
          <h2 className="font-bold text-[#1e3a5f] mb-2">Seguridad</h2>
          <p className="text-xs text-slate-400 mb-4">
            El cambio de contraseña estará disponible cuando se habilite el endpoint seguro de perfil.
          </p>
          <form className="space-y-3" onSubmit={onSubmitPassword}>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Contraseña actual</label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.currentPassword}
                onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-400"
                disabled
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.newPassword}
                onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-400"
                disabled
              />
            </div>
            <button
              type="submit"
              disabled
              className="w-full rounded-xl bg-slate-100 text-slate-400 py-2.5 text-sm font-semibold cursor-not-allowed"
            >
              🔒 Cambiar contraseña
            </button>
          </form>
        </article>
      </section>

      {/* Danger zone */}
      <article className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <h2 className="font-bold text-red-700 mb-1">Zona de peligro</h2>
        <p className="text-xs text-red-500 mb-4">Esta acción cerrará tu sesión en todos los dispositivos.</p>
        <button
          type="button"
          onClick={logout}
          className="rounded-xl bg-red-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-red-700 transition-colors"
        >
          Cerrar sesión
        </button>
      </article>
    </div>
  );
}

export default StudentProfile;
