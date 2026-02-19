import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';

function CourseDetailLayout() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">Curso #{courseId}</h1>
          <p className="text-gray-600">Panel unificado: analitica, estudiantes y materiales.</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/dashboard/docente/cursos')}
          className="bg-gray-200 hover:bg-gray-300 transition px-4 py-2 rounded-lg"
        >
          Volver a cursos
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow p-2 inline-flex gap-2">
        <NavLink
          end
          to="."
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[#0A2E57] text-white' : 'text-gray-700 hover:bg-gray-100'}`
          }
        >
          Dashboard
        </NavLink>
        <NavLink
          to="students"
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[#0A2E57] text-white' : 'text-gray-700 hover:bg-gray-100'}`
          }
        >
          Estudiantes
        </NavLink>
        <NavLink
          to="materials"
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[#0A2E57] text-white' : 'text-gray-700 hover:bg-gray-100'}`
          }
        >
          Materiales
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}

export default CourseDetailLayout;
