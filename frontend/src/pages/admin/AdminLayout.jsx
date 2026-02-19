import { Outlet } from 'react-router-dom';
import AdminSidebar from '../../components/admin/AdminSidebar';
import { adminTokens } from './adminTokens';

function AdminLayout() {
  return (
    <div className="min-h-screen flex bg-slate-100">
      <AdminSidebar />
      <main className={`flex-1 overflow-auto ${adminTokens.spacing.page}`}>
        <Outlet />
      </main>
    </div>
  );
}

export default AdminLayout;
