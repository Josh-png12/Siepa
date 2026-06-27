import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

const sections = [
  {
    title: 'Panel',
    links: [{ to: '.', label: 'Dashboard', icon: 'DB' }]
  },
  {
    title: 'Gestion',
    links: [
      { to: 'users', label: 'Usuarios', icon: 'US' },
      { to: 'courses', label: 'Cursos', icon: 'CU' }
    ]
  },
  {
    title: 'Contenido',
    links: [
      { to: 'questions', label: 'Banco de Preguntas', icon: 'BP' },
      { to: 'simulacros', label: 'Simulacros', icon: 'SI' },
      { to: 'pdf-import', label: 'Importar PDF', icon: 'PD' }
    ]
  },
  {
    title: 'OCR',
    links: [{ to: 'templates', label: 'Plantillas OCR', icon: 'OC' }]
  },
  {
    title: 'Analisis',
    links: [
      { to: 'analytics', label: 'Analitica Institucional', icon: 'AN' },
      { to: 'audit', label: 'Auditoria', icon: 'AU' }
    ]
  },
  {
    title: 'Sistema',
    links: [{ to: 'config', label: 'Configuracion', icon: 'CF' }]
  }
];

function AdminSidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout } = useAuthStore();

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-5',
        'border-r border-[#08213f] bg-[#0A2E57] p-5',
        'transition-transform duration-300 ease-in-out',
        'lg:static lg:translate-x-0 lg:min-h-screen lg:flex-shrink-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
    >
      {/* Logo + mobile close */}
      <div className="flex items-center justify-between text-white">
        <div>
          <p className="text-2xl font-bold tracking-tight">SIEPA</p>
          <p className="text-xs text-blue-200">Administrador institucional</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar menú"
          className="lg:hidden rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-blue-300">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '.'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-white text-[#0A2E57] font-semibold shadow'
                        : 'text-blue-100 hover:bg-white/10'
                    }`
                  }
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-[10px] font-semibold flex-shrink-0">
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-4 text-white">
        <p className="text-sm font-semibold truncate">{user?.name || 'Admin'}</p>
        <p className="text-xs text-blue-200 truncate">{user?.email}</p>
        <button
          type="button"
          onClick={logout}
          className="mt-3 w-full rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-red-500/60 transition-colors"
        >
          Cerrar sesion
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
