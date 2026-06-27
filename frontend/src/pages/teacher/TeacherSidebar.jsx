import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

const CloseIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function TeacherSidebar({ isOpen = false, onClose = () => {} }) {
  const { logout, user } = useAuthStore();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all text-sm ${
      isActive
        ? 'bg-white text-[#0A2E57] shadow-md font-semibold'
        : 'hover:bg-white/10 text-blue-100'
    }`;

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 flex w-72 flex-col',
        'bg-[#0A2E57] text-white shadow-xl',
        'transition-transform duration-300 ease-in-out',
        'lg:static lg:translate-x-0 lg:min-h-screen lg:flex-shrink-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-blue-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-[#0A2E57] text-xl font-black shadow flex-shrink-0">
            S
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight leading-tight">SIEPA</div>
            <div className="text-xs text-blue-300 leading-tight">Docente</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="lg:hidden rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        <NavLink to="." end className={linkClass} onClick={onClose}>Dashboard</NavLink>
        <NavLink to="cursos" className={linkClass} onClick={onClose}>Mis Cursos</NavLink>
        <NavLink to="simulacros" className={linkClass} onClick={onClose}>Simulacros</NavLink>
        {user?.features?.physicalSimulacros ? (
          <NavLink to="ocr" className={linkClass} onClick={onClose}>Calificacion OCR</NavLink>
        ) : null}
        <NavLink to="preguntas" className={linkClass} onClick={onClose}>Banco de Preguntas</NavLink>
        <NavLink to="pdf-import" className={linkClass} onClick={onClose}>Importar PDF</NavLink>
      </nav>

      {/* User */}
      <div className="px-5 py-5 border-t border-blue-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow flex-shrink-0">
            {getInitials(user?.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate leading-tight">{user?.name || 'Docente'}</p>
            <p className="text-blue-300 text-xs truncate leading-tight">{user?.email || 'Docente'}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full bg-white/10 hover:bg-red-600/50 text-white py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 justify-center transition-all"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar Sesion
        </button>
      </div>
    </aside>
  );
}

export default TeacherSidebar;
