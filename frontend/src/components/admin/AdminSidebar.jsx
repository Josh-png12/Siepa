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

function AdminSidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex min-h-screen w-80 flex-col gap-5 border-r border-[#08213f] bg-[#0A2E57] p-5">
      <div className="text-white">
        <p className="text-2xl font-bold tracking-tight">SIEPA</p>
        <p className="text-xs text-blue-200">Administrador institucional</p>
      </div>

      <nav className="space-y-4 overflow-auto">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-blue-300">{section.title}</p>
            <div className="space-y-1">
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '.'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? 'bg-white text-[#0A2E57] font-semibold shadow'
                        : 'text-blue-100 hover:bg-white/10'
                    }`
                  }
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-[10px] font-semibold">
                    {link.icon}
                  </span>
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-4 text-white">
        <p className="text-sm font-semibold">{user?.name || 'Admin'}</p>
        <p className="text-xs text-blue-200">{user?.email}</p>
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

export default AdminSidebar;
