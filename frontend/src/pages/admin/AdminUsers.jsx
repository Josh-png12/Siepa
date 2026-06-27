import { useEffect, useMemo, useState } from 'react';
import {
  adminCreateUser,
  adminDeleteUser,
  adminImportUsers,
  adminListUsers,
  adminPatchUser,
  adminResetUserPassword
} from '../../services/api';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal';
import { adminTokens } from './adminTokens';

const defaultQuery = { q: '', role: '', status: '', page: 1, limit: 20 };

function AdminUsers() {
  const [query, setQuery] = useState(defaultQuery);
  const [result, setResult] = useState({ items: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'docente' });
  const [formErrors, setFormErrors] = useState({});
  const [importFile, setImportFile] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [toast, setToast] = useState({ type: 'info', message: '' });
  const [resetUser, setResetUser] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await adminListUsers(query);
      setResult(res.data);
      setError('');
      setErrorDetails([]);
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (err.response?.status === 400) {
        setToast({ type: 'error', message: 'Filtros invalidos. Se restablecieron.' });
        setQuery((prev) => ({ ...defaultQuery, q: prev.q || '' }));
      }
      if (Array.isArray(apiErrors) && apiErrors.length) {
        setError('No se pudo cargar');
        setErrorDetails(apiErrors);
      } else {
        setError('No se pudo cargar');
        setErrorDetails([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [query.page, query.role, query.status, query.q, query.limit]);

  const validateForm = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Nombre requerido';
    if (!form.email.trim()) nextErrors.email = 'Email requerido';
    if (!form.password.trim() || form.password.length < 6) nextErrors.password = 'Minimo 6 caracteres';
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const create = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;
    await adminCreateUser(form);
    setForm({ name: '', email: '', password: '', role: 'docente' });
    setFormErrors({});
    setToast({ type: 'success', message: 'Usuario creado correctamente.' });
    load();
  };

  const suspend = async (id) => {
    await adminPatchUser(id, { status: 'suspended' });
    setToast({ type: 'success', message: 'Usuario suspendido.' });
    load();
  };

  const toggleFeature = async (user, key) => {
    const current = Boolean(user.features?.[key]);
    await adminPatchUser(user.id, { features: { ...user.features, [key]: !current } });
    setToast({ type: 'success', message: 'Función actualizada correctamente.' });
    load();
  };

  const submitResetPassword = async (newPassword) => {
    if (!resetUser || resetLoading) return;
    try {
      setResetLoading(true);
      await adminResetUserPassword(resetUser.id, newPassword);
      setToast({ type: 'success', message: 'Contrasena restablecida exitosamente.' });
      setResetUser(null);
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo resetear contrasena.' });
    } finally {
      setResetLoading(false);
    }
  };

  const remove = async () => {
    if (!confirmDeleteId) return;
    await adminDeleteUser(confirmDeleteId);
    setConfirmDeleteId('');
    setToast({ type: 'success', message: 'Usuario eliminado (soft delete).' });
    load();
  };

  const handleImport = async () => {
    if (!importFile) return;
    const fd = new FormData();
    fd.append('file', importFile);
    await adminImportUsers(fd);
    setImportFile(null);
    setToast({ type: 'success', message: 'Importacion completada.' });
    load();
  };

  const pagination = useMemo(() => result.pagination || {}, [result]);

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <ConfirmModal
        isOpen={Boolean(confirmDeleteId)}
        title="Eliminar usuario"
        description="Esta accion aplica soft delete y desactiva el acceso del usuario."
        confirmLabel="Eliminar"
        onConfirm={remove}
        onCancel={() => setConfirmDeleteId('')}
      />

      <ResetPasswordModal
        isOpen={Boolean(resetUser)}
        user={resetUser}
        loading={resetLoading}
        onClose={() => { if (!resetLoading) setResetUser(null); }}
        onSubmit={submitResetPassword}
      />

      <div>
        <h1 className={adminTokens.classes.title}>Usuarios</h1>
        <p className={adminTokens.classes.subtitle}>Gestion centralizada de identidades y accesos.</p>
      </div>

      {error ? (
        <EmptyState
          title={error}
          description={errorDetails.length ? errorDetails.join(' | ') : 'No se pudo cargar'}
          actionLabel="Reset filtros"
          onAction={() => setQuery(defaultQuery)}
        />
      ) : null}

      <div className="grid lg:grid-cols-3 gap-4">
        <form onSubmit={create} className={`${adminTokens.classes.card} p-4 space-y-2`}>
          <h2 className={adminTokens.classes.sectionHeader}>Crear usuario</h2>
          <input placeholder="Nombre" className={`${adminTokens.classes.input} w-full`} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          {formErrors.name ? <p className="text-xs text-red-600">{formErrors.name}</p> : null}
          <input placeholder="Email" type="email" autoComplete="email" className={`${adminTokens.classes.input} w-full`} value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
          {formErrors.email ? <p className="text-xs text-red-600">{formErrors.email}</p> : null}
          <input placeholder="Password" type="password" className={`${adminTokens.classes.input} w-full`} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} autoComplete="new-password" />
          {formErrors.password ? <p className="text-xs text-red-600">{formErrors.password}</p> : null}
          <select className={`${adminTokens.classes.input} w-full`} value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}>
            <option value="docente">Docente</option>
            <option value="estudiante">Estudiante</option>
            <option value="admin">Admin</option>
          </select>
          <button type="submit" className={`w-full ${adminTokens.classes.buttonPrimary}`}>Crear</button>
        </form>

        <div className={`${adminTokens.classes.card} p-4 space-y-2`}>
          <h2 className={adminTokens.classes.sectionHeader}>Importar usuarios</h2>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          <button type="button" onClick={handleImport} className={`w-full ${adminTokens.classes.buttonPrimary}`}>Importar</button>
        </div>

        <div className={`${adminTokens.classes.card} p-4 space-y-2`}>
          <h2 className={adminTokens.classes.sectionHeader}>Busqueda y filtros</h2>
          <input placeholder="Buscar por nombre o email" className={`${adminTokens.classes.input} w-full`} value={query.q} onChange={(e) => setQuery((q) => ({ ...q, page: 1, q: e.target.value }))} />
          <select className={`${adminTokens.classes.input} w-full`} value={query.role} onChange={(e) => setQuery((q) => ({ ...q, page: 1, role: e.target.value }))}>
            <option value="">Todos los roles</option>
            <option value="docente">Docente</option>
            <option value="estudiante">Estudiante</option>
            <option value="admin">Admin</option>
          </select>
          <select className={`${adminTokens.classes.input} w-full`} value={query.status} onChange={(e) => setQuery((q) => ({ ...q, page: 1, status: e.target.value }))}>
            <option value="">Todos</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="suspended">Suspendido</option>
          </select>
          <button type="button" className={adminTokens.classes.buttonGhost} onClick={() => setQuery(defaultQuery)}>Reset filtros</button>
        </div>
      </div>

      <div className={`${adminTokens.classes.card} overflow-auto`}>
        {loading ? (
          <div className="p-4 space-y-2">
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
          </div>
        ) : result.items.length === 0 ? (
          <div className="p-4">
            <EmptyState title="Sin usuarios" description="No hay usuarios para los filtros actuales." actionLabel="Reset filtros" onAction={() => setQuery(defaultQuery)} />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={adminTokens.classes.tableHead}>
                <th className="p-3">Nombre</th>
                <th className="p-3">Email</th>
                <th className="p-3">Rol</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Funciones</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="p-3">{user.name}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">{user.role}</td>
                  <td className="p-3">
                    <span className={`${adminTokens.classes.badge} ${user.status === 'active' ? adminTokens.colors.successSoft : user.status === 'suspended' ? adminTokens.colors.warningSoft : adminTokens.colors.dangerSoft}`}>
                      {user.status === 'active' ? 'Activo' : user.status === 'suspended' ? 'Suspendido' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="p-3 space-y-1">
                    <button type="button" onClick={() => toggleFeature(user, 'physicalSimulacros')} className="px-2 py-1 text-xs rounded bg-slate-100">
                      Simulacros físicos: {user.features?.physicalSimulacros ? 'Activo' : 'Inactivo'}
                    </button>
                    <button type="button" onClick={() => toggleFeature(user, 'ocrEnabled')} className="px-2 py-1 text-xs rounded bg-slate-100 ml-1">
                      Lectura automática: {user.features?.ocrEnabled === false ? 'Inactivo' : 'Activo'}
                    </button>
                  </td>
                  <td className="p-3 space-x-2">
                    <button type="button" onClick={() => suspend(user.id)} className="px-2 py-1 bg-amber-500 text-white rounded">Suspender</button>
                    <button type="button" onClick={() => setResetUser(user)} className="px-2 py-1 bg-blue-600 text-white rounded">Restablecer contraseña</button>
                    <button type="button" onClick={() => setConfirmDeleteId(user.id)} className="px-2 py-1 bg-red-600 text-white rounded">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page || 1) - 1) }))} className={adminTokens.classes.buttonGhost}>Anterior</button>
        <span className="text-sm self-center">{pagination.page || 1}/{pagination.totalPages || 1}</span>
        <button type="button" onClick={() => setQuery((q) => ({ ...q, page: Math.min(pagination.totalPages || 1, (q.page || 1) + 1) }))} className={adminTokens.classes.buttonGhost}>Siguiente</button>
      </div>
    </div>
  );
}

export default AdminUsers;
