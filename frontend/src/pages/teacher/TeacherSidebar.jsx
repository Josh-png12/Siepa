import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';

function TeacherSidebar() {
  const { logout, user } = useAuthStore();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-4 px-6 py-4 rounded-2xl font-medium transition-all text-base ${
      isActive ? 'bg-white text-[#0A2E57] shadow-lg font-semibold' : 'hover:bg-white/10 text-blue-100'
    }`;

  return (
    <aside className="w-72 bg-[#0A2E57] text-white min-h-screen flex flex-col shadow-xl">
      <div className="p-8 flex items-center gap-4 border-b border-blue-800">
        <div className="w-14 h-14 bg-white rounded-3xl flex items-center justify-center text-[#0A2E57] text-5xl font-black shadow">S</div>
        <div>
          <div className="text-4xl font-bold tracking-tighter">SIEPA</div>
          <div className="text-xs text-blue-300 -mt-1">Docente</div>
        </div>
      </div>

      <nav className="flex-1 py-10 px-6 space-y-2">
        <NavLink to="." end className={linkClass}>Dashboard</NavLink>
        <NavLink to="cursos" className={linkClass}>Mis Cursos</NavLink>
        <NavLink to="simulacros" className={linkClass}>Simulacros</NavLink>
        {user?.features?.physicalSimulacros ? (
          <NavLink to="ocr" className={linkClass}>Calificacion OCR</NavLink>
        ) : null}
        <NavLink to="preguntas" className={linkClass}>Banco de Preguntas</NavLink>
        <NavLink to="pdf-import" className={linkClass}>Importar PDF</NavLink>
      </nav>

      <div className="p-6 border-t border-blue-800 bg-[#0A2E57]/80">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/50 shadow">
            <img src="https://i.pravatar.cc/128" alt="Docente" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-semibold text-lg">{user?.name || 'Docente'}</p>
            <p className="text-blue-300 text-sm">Docente</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full bg-white/10 hover:bg-red-600/50 text-white py-3 rounded-2xl font-medium flex items-center gap-2 justify-center transition-all"
        >
          Cerrar Sesion
        </button>
      </div>
    </aside>
  );
}

export default TeacherSidebar;
