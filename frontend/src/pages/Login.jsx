import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import FormField from '../components/ui/FormField';
import Spinner from '../components/ui/Spinner';

const dashboardByRole = {
  admin: '/dashboard/admin',
  docente: '/dashboard/teacher',
  estudiante: '/dashboard/student'
};

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="1.8" rx="2" />
      <path d="m5 7 7 6 7-6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.7 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a18.3 18.3 0 0 1-4.2 4.9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 8.7C3.8 10.7 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.2-.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function Login() {
  const navigate = useNavigate();
  const { user, token, isTokenValid, login: setAuth } = useAuthStore();

  const [form, setForm] = useState({
    email: '',
    password: '',
    remember: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => !loading, [loading]);

  useEffect(() => {
    if (user?.role && token && isTokenValid()) {
      navigate(dashboardByRole[user.role] || '/dashboard', { replace: true });
    }
  }, [user, token, isTokenValid, navigate]);

  const validate = () => {
    const next = { email: '', password: '' };

    if (!form.email.trim()) {
      next.email = 'Ingresa tu correo institucional.';
    }

    if (!form.password) {
      next.password = 'Ingresa tu contrasena.';
    }

    setErrors(next);
    return !next.email && !next.password;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setApiError('');
    if (!validate()) return;

    try {
      setLoading(true);
      const response = await login({ email: form.email.trim(), password: form.password, schoolSlug: 'demo' });
      const payload = response?.data?.data || {};
      const authUser = payload.user;
      const authToken = payload.token;

      if (!authUser?.role || !authToken) {
        throw new Error('Respuesta invalida del servidor');
      }

      setAuth(authUser, authToken, { remember: form.remember });
      navigate(dashboardByRole[authUser.role] || '/dashboard', { replace: true });
    } catch (err) {
      const status = err.response?.status;
      if (status === 400 || status === 401) {
        const message = 'Correo o contrasena incorrectos';
        setApiError(message);
        setErrors((prev) => ({
          email: prev.email || message,
          password: prev.password || message
        }));
      } else {
        setApiError(err.response?.data?.message || 'No pudimos iniciar sesion. Intenta nuevamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8f2ff_0%,#f4f7fc_40%,#f8fafc_100%)] p-4 sm:p-6 lg:p-10">
      <div className="mx-auto flex min-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-32px_rgba(15,45,82,0.35)] lg:flex-row">
        <section className="w-full p-6 sm:p-10 lg:w-1/2 lg:p-12">
          <div className="mx-auto w-full max-w-md space-y-6">
            <div className="space-y-2">
              <img src="/logo-siepa.png" alt="SIEPA" className="h-14 w-auto" />
              <h1 className="text-3xl font-bold tracking-tight text-[#0A2E57]">Bienvenido a SIEPA</h1>
              <p className="text-sm text-slate-600">Inicia sesion para continuar.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormField
                id="email"
                label="Correo institucional"
                icon={<MailIcon />}
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, email: e.target.value }));
                  if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                }}
                placeholder="correo@institucion.edu"
                autoComplete="email"
                disabled={loading}
                error={errors.email}
                inputProps={{ tabIndex: 1 }}
              />

              <FormField
                id="password"
                label="Contrasena"
                icon={<LockIcon />}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, password: e.target.value }));
                  if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                error={errors.password}
                inputProps={{ tabIndex: 2 }}
                rightAdornment={(
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A2E57]"
                    aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                    tabIndex={3}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                )}
              />

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.remember}
                    onChange={(e) => setForm((prev) => ({ ...prev, remember: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-[#0A2E57] focus:ring-[#0A2E57]"
                    disabled={loading}
                    tabIndex={4}
                  />
                  Recordarme
                </label>

                <span className="text-xs text-slate-500">Sesión segura con JWT</span>
              </div>

              {apiError ? <p className="text-sm text-red-600">{apiError}</p> : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A2E57] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#082443] disabled:cursor-not-allowed disabled:opacity-70"
                tabIndex={5}
              >
                {loading ? (
                  <>
                    <Spinner className="h-4 w-4" label="Ingresando" />
                    Ingresando…
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </form>

            <p className="text-xs text-slate-500">
              ¿Problemas para entrar? Contacta al administrador.
            </p>
            <p className="text-[11px] text-slate-400">
              Tu informacion viaja cifrada. Nunca compartas tu contrasena.
            </p>
          </div>
        </section>

        <aside className="relative hidden w-full overflow-hidden bg-gradient-to-br from-[#0A2E57] via-[#11427a] to-[#00A3E0] p-10 text-white lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.20),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.14),transparent_30%)]" />
          <div className="relative z-10 max-w-sm space-y-3">
            <h2 className="text-2xl font-semibold">Tu rendimiento, en tiempo real</h2>
            <p className="text-sm text-sky-100">Analitica clara para tomar mejores decisiones academicas cada semana.</p>
          </div>

          <div className="relative z-10 my-8">
            <img src="/illustration-login.png" alt="Panel academico SIEPA" className="mx-auto max-h-[320px] w-auto object-contain drop-shadow-2xl" />
          </div>

          <ul className="relative z-10 space-y-3 text-sm text-sky-50">
            <li className="rounded-xl bg-white/15 px-4 py-3">Resultados consolidados por area y percentil.</li>
            <li className="rounded-xl bg-white/15 px-4 py-3">Simulacros virtuales y fisicos en una linea de tiempo.</li>
            <li className="rounded-xl bg-white/15 px-4 py-3">Motor TRI para recomendaciones de estudio personalizadas.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default Login;
