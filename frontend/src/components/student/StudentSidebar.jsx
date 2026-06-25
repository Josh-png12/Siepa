import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

// Inline SVG icons — no external dependency required
const Icons = {
  Home: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1V10" />
    </svg>
  ),
  Simulacros: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  Results: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  Progress: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Plan: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  Profile: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Logout: () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
  Close: () => (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

const links = [
  { to: '.', label: 'Inicio', Icon: Icons.Home, end: true },
  { to: 'simulacros', label: 'Simulacros', Icon: Icons.Simulacros },
  { to: 'resultados', label: 'Resultados', Icon: Icons.Results },
  { to: 'progreso', label: 'Progreso', Icon: Icons.Progress },
  { to: 'plan-estudio', label: 'Plan de Estudio', Icon: Icons.Plan },
  { to: 'perfil', label: 'Perfil', Icon: Icons.Profile },
];

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

function StudentSidebar({ isOpen, onClose }) {
  const { user, logout } = useAuthStore();

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-72
        bg-gradient-to-b from-[#1e3a5f] via-[#1a3358] to-[#12264a]
        text-white shadow-2xl transition-transform duration-300
        lg:static lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Logo header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-white font-black text-base leading-none">S</span>
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-white leading-tight">SIEPA</p>
              <p className="text-[10px] text-blue-300 leading-tight">Panel Estudiante</p>
            </div>
          </div>
        </div>
        {/* Mobile close */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Icons.Close />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white text-[#1e3a5f] shadow-md'
                  : 'text-blue-100/80 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Indicator stripe */}
                <span className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isActive ? 'bg-[#1e3a5f]/10' : 'bg-white/10 group-hover:bg-white/15'
                }`}>
                  <Icon />
                </span>
                <span className="truncate">{label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center shadow text-white text-sm font-bold">
            {getInitials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{user?.name || 'Estudiante'}</p>
            <p className="text-xs text-blue-300 truncate leading-tight">{user?.email || ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-blue-200/80 hover:bg-red-500/20 hover:text-red-300 transition-colors"
        >
          <Icons.Logout />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

export default StudentSidebar;
