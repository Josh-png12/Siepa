import { NavLink, Outlet } from 'react-router-dom';

function PhysicalSimulacrosLayout() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#0A2E57]">Simulacro Fisico</h1>
          <p className="text-gray-600">Flujo ICFES: creacion, PDF, escaneo OMR y publicacion</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-2 inline-flex gap-2">
        <NavLink
          to="."
          end
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[#0A2E57] text-white' : 'text-gray-700 hover:bg-gray-100'}`
          }
        >
          Listado
        </NavLink>
        <NavLink
          to="crear"
          className={({ isActive }) =>
            `px-4 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-[#0A2E57] text-white' : 'text-gray-700 hover:bg-gray-100'}`
          }
        >
          Crear
        </NavLink>
      </div>

      <Outlet />
    </div>
  );
}

export default PhysicalSimulacrosLayout;
