import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import {
  getActivePhysicalTemplate,
  listTeachersForAdmin,
  updateTeacherFeature,
  uploadPhysicalTemplate
} from '../services/api';

function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [teachers, setTeachers] = useState([]);
  const [template, setTemplate] = useState(null);
  const [templateFile, setTemplateFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingTeacherId, setSavingTeacherId] = useState('');
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [teachersResponse, templateResponse] = await Promise.all([
        listTeachersForAdmin(),
        getActivePhysicalTemplate()
      ]);
      setTeachers(teachersResponse.teachers || []);
      setTemplate(templateResponse.template || null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar datos de administracion');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/login');
      return;
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  const toggleFeature = async (teacher) => {
    try {
      setSavingTeacherId(String(teacher._id));
      setError('');
      setSuccess('');

      const response = await updateTeacherFeature(teacher._id, !teacher.features?.physicalSimulacros);

      setTeachers((prev) =>
        prev.map((item) =>
          String(item._id) === String(teacher._id) ? { ...item, features: response.teacher.features } : item
        )
      );

      setSuccess(`Permiso actualizado para ${teacher.name}.`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo actualizar permiso de docente');
    } finally {
      setSavingTeacherId('');
    }
  };

  const uploadTemplate = async () => {
    if (!templateFile) return;

    try {
      setUploadingTemplate(true);
      setError('');
      setSuccess('');

      const formData = new FormData();
      formData.append('template', templateFile);
      formData.append('name', templateFile.name);

      await uploadPhysicalTemplate(formData);
      setTemplateFile(null);
      await load();
      setSuccess('Plantilla base PDF actualizada.');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo subir plantilla base');
    } finally {
      setUploadingTemplate(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 space-y-6">
      <div className="bg-[#002855] text-white py-4 px-6 rounded-2xl flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Panel de Administracion</h1>
          <p className="text-sm text-blue-100">Control de permisos y plantilla de simulacro fisico</p>
        </div>

        <button onClick={logout} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm">Cerrar Sesion</button>
      </div>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg">{success}</div> : null}

      <section className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h2 className="text-xl font-semibold text-[#0A2E57]">Plantilla base de simulacro fisico (PDF)</h2>
        <p className="text-sm text-gray-600">Activa: {template?.name || 'No configurada'}</p>
        <div className="flex flex-wrap gap-2">
          <input type="file" accept="application/pdf" onChange={(e) => setTemplateFile(e.target.files?.[0] || null)} className="border rounded-lg px-3 py-2" />
          <button type="button" onClick={uploadTemplate} disabled={uploadingTemplate || !templateFile} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
            {uploadingTemplate ? 'Subiendo...' : 'Subir plantilla'}
          </button>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <div className="p-5 border-b">
          <h2 className="text-xl font-semibold text-[#0A2E57]">Permiso: Simulacro Fisico por docente</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Email</th>
              <th className="p-3">PhysicalSimulacros</th>
              <th className="p-3">Accion</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="4">Cargando...</td></tr>
            ) : teachers.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="4">Sin docentes registrados.</td></tr>
            ) : (
              teachers.map((teacher) => {
                const enabled = Boolean(teacher.features?.physicalSimulacros);
                const busy = savingTeacherId === String(teacher._id);

                return (
                  <tr key={teacher._id} className="border-b">
                    <td className="p-3">{teacher.name}</td>
                    <td className="p-3">{teacher.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleFeature(teacher)}
                        disabled={busy}
                        className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-60"
                      >
                        {busy ? 'Guardando...' : enabled ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default AdminDashboard;
