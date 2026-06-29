import { useEffect, useState } from 'react';
import {
  adminAssignTeacher,
  adminCreateCourse,
  adminDeleteCourse,
  adminListCourses,
  adminListUsers
} from '../../services/api';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Toast from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import { adminTokens } from './adminTokens';

const defaultFilters = { q: '', page: 1, limit: 20 };

function AdminCourses() {
  const [data, setData] = useState({ items: [], pagination: {} });
  const [teachers, setTeachers] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', grade: '', year: '', teacher: '' });
  const [deleteId, setDeleteId] = useState('');
  const [assignTarget, setAssignTarget] = useState(null);
  const [toast, setToast] = useState({ type: 'info', message: '' });

  const load = async () => {
    try {
      setLoading(true);
      const [coursesRes, teachersRes] = await Promise.all([
        adminListCourses(filters),
        adminListUsers({ role: 'docente', limit: 200 })
      ]);
      setData(coursesRes.data || { items: [], pagination: {} });
      setTeachers(teachersRes.data?.items || []);
      setError('');
    } catch (err) {
      if (err.response?.status === 400) {
        setFilters(defaultFilters);
        setToast({ type: 'error', message: 'Filtros invalidos. Se restablecieron.' });
      }
      const details = err.response?.data?.errors;
      setError(Array.isArray(details) && details.length ? details.join(' | ') : 'No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.page, filters.limit, filters.q]);

  const create = async (event) => {
    event.preventDefault();
    try {
      await adminCreateCourse(form);
      setForm({ name: '', grade: '', year: '', teacher: '' });
      setToast({ type: 'success', message: 'Curso creado correctamente.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo crear el curso.' });
    }
  };

  const confirmAssignTeacher = async () => {
    if (!assignTarget?.courseId || !assignTarget?.teacherId) return;
    try {
      await adminAssignTeacher(assignTarget.courseId, assignTarget.teacherId);
      setAssignTarget(null);
      setToast({ type: 'success', message: 'Docente asignado.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo asignar docente.' });
    }
  };

  const removeCourse = async () => {
    if (!deleteId) return;
    try {
      await adminDeleteCourse(deleteId);
      setDeleteId('');
      setToast({ type: 'success', message: 'Curso desactivado.' });
      await load();
    } catch (err) {
      setToast({ type: 'error', message: err.response?.data?.message || 'No se pudo eliminar el curso.' });
    }
  };

  return (
    <div className={adminTokens.classes.page}>
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ type: 'info', message: '' })} />

      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title="Eliminar curso"
        description="El curso se marcara como inactivo (soft delete)."
        confirmLabel="Eliminar"
        onConfirm={removeCourse}
        onCancel={() => setDeleteId('')}
      />

      <ConfirmModal
        isOpen={Boolean(assignTarget)}
        title="Asignar docente"
        description="Confirma el cambio de docente para este curso."
        confirmLabel="Asignar"
        onConfirm={confirmAssignTeacher}
        onCancel={() => setAssignTarget(null)}
      />

      <div>
        <h1 className={adminTokens.classes.title}>Cursos</h1>
        <p className={adminTokens.classes.subtitle}>Gestion academica con asignacion docente y estado institucional.</p>
      </div>

      {error ? (
        <ErrorState
          title="No se pudo cargar"
          description={error}
          actionLabel="Reset filtros"
          onAction={() => setFilters(defaultFilters)}
        />
      ) : null}

      <form onSubmit={create} className={`${adminTokens.classes.card} p-4 grid md:grid-cols-6 gap-2`}>
        <input required placeholder="Nombre" className={adminTokens.classes.input} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
        <input required placeholder="Grado" className={adminTokens.classes.input} value={form.grade} onChange={(e) => setForm((s) => ({ ...s, grade: e.target.value }))} />
        <input required placeholder="Anio" className={adminTokens.classes.input} value={form.year} onChange={(e) => setForm((s) => ({ ...s, year: e.target.value }))} />
        <input
          placeholder="Buscar curso"
          className={adminTokens.classes.input}
          value={filters.q}
          onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, q: e.target.value }))}
        />
        <select required className={adminTokens.classes.input} value={form.teacher} onChange={(e) => setForm((s) => ({ ...s, teacher: e.target.value }))}>
          <option value="">Selecciona docente</option>
          {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
        <button type="submit" className={adminTokens.classes.buttonPrimary}>Crear curso</button>
      </form>

      <div className={`${adminTokens.classes.card} overflow-auto`}>
        {loading ? (
          <div className="p-4 space-y-2">
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
            <LoadingSkeleton className="h-10" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No hay cursos"
              description="Crea un curso para comenzar o limpia filtros."
              actionLabel="Reset filtros"
              onAction={() => setFilters(defaultFilters)}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={adminTokens.classes.tableHead}>
                <th className="p-3">Curso</th>
                <th className="p-3">Grado</th>
                <th className="p-3">Anio</th>
                <th className="p-3">Docente</th>
                <th className="p-3">Estudiantes</th>
                <th className="p-3">Asignar docente</th>
                <th className="p-3">Accion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((course) => (
                <tr key={course.id} className="border-t">
                  <td className="p-3">{course.name}</td>
                  <td className="p-3">{course.grade}</td>
                  <td className="p-3">{course.year}</td>
                  <td className="p-3">{course.teacher?.name || 'Sin asignar'}</td>
                  <td className="p-3">{course.students?.length || 0}</td>
                  <td className="p-3">
                    <select
                      className="border rounded px-2 py-1"
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        setAssignTarget({ courseId: course.id, teacherId: e.target.value });
                        e.target.value = '';
                      }}
                    >
                      <option value="">Seleccionar</option>
                      {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <button type="button" onClick={() => setDeleteId(course.id)} className="px-2 py-1 rounded bg-red-600 text-white">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
          className={adminTokens.classes.buttonGhost}
        >
          Anterior
        </button>
        <span className="self-center text-sm">{data.pagination?.page || 1}/{data.pagination?.totalPages || 1}</span>
        <button
          type="button"
          onClick={() => setFilters((prev) => ({ ...prev, page: Math.min(data.pagination?.totalPages || 1, (prev.page || 1) + 1) }))}
          className={adminTokens.classes.buttonGhost}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

export default AdminCourses;
