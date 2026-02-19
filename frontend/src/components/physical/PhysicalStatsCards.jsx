function PhysicalStatsCards({ stats }) {
  return (
    <div className="grid md:grid-cols-4 gap-3">
      <div className="border rounded p-3"><p className="text-xs text-gray-500">Total asignados</p><p className="text-2xl font-bold">{stats?.totalAssigned || 0}</p></div>
      <div className="border rounded p-3"><p className="text-xs text-gray-500">Escaneados</p><p className="text-2xl font-bold">{stats?.totalScanned || 0}</p></div>
      <div className="border rounded p-3"><p className="text-xs text-gray-500">Pendientes</p><p className="text-2xl font-bold">{stats?.totalPending || 0}</p></div>
      <div className="border rounded p-3"><p className="text-xs text-gray-500">Invalidas</p><p className="text-2xl font-bold text-red-700">{stats?.invalidSheets || 0}</p></div>
    </div>
  );
}

export default PhysicalStatsCards;
