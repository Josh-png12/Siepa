import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const links = [
  { to: '.', label: 'Inicio', icon: 'IN' },
  { to: 'simulacros', label: 'Simulacros', icon: 'SI' },
  { to: 'resultados', label: 'Resultados', icon: 'RE' },
  { to: 'progreso', label: 'Progreso', icon: 'PR' },
  { to: 'plan-estudio', label: 'Plan de Estudio', icon: 'PL' },
  { to: 'perfil', label: 'Perfil', icon: 'PE' }
];

function StudentSidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex min-h-screen w-72 flex-col border-r border-[#dce6f3] bg-gradient-to-b from-[#0F2D52] to-[#123A68] p-5 text-white">
      <div className="pb-5">
        <p className="text-2xl font-bold tracking-tight">SIEPA</p>
        <p className="text-xs text-sky-200">Panel Estudiante</p>
      </div>

      <nav className="flex-1 space-y-2">
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '.'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                isActive
                  ? 'bg-white text-[#0F2D52] font-semibold shadow'
                  : 'text-slate-100 hover:bg-white/10'
              }`
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-[10px] font-semibold">
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/20 pt-4">
        <p className="text-sm font-semibold">{user?.name || 'Estudiante'}</p>
        <p className="text-xs text-sky-200">{user?.email || ''}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-red-500/60"
        >
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
}

export default StudentSidebar;
