import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  createCourseMaterial,
  deleteCourseMaterial,
  getCourseMaterials,
  updateCourseMaterial
} from '../../services/api';
import UploadMaterialModal from '../../components/teacher/UploadMaterialModal.jsx';

function iconForType(fileType = '') {
  if (fileType.includes('pdf')) return 'PDF';
  if (fileType.includes('word') || fileType.includes('doc')) return 'DOC';
  if (fileType.includes('presentation') || fileType.includes('powerpoint') || fileType.includes('ppt')) return 'PPT';
  if (fileType.includes('image')) return 'IMG';
  return 'FILE';
}

function CourseMaterials() {
  const { courseId } = useParams();

  const [materials, setMaterials] = useState([]);
  const [filters, setFilters] = useState({ area: '', competencia: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await getCourseMaterials(courseId, filters);
      setMaterials(response.materials || []);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudieron cargar los materiales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, filters.area, filters.competencia]);

  const filtered = useMemo(() => materials, [materials]);

  const openUpload = () => {
    setEditingMaterial(null);
    setModalOpen(true);
  };

  const openEdit = (material) => {
    setEditingMaterial(material);
    setModalOpen(true);
  };

  const onSave = async (formData) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (editingMaterial) {
        await updateCourseMaterial(courseId, editingMaterial._id, formData);
        setSuccess('Material actualizado correctamente.');
      } else {
        await createCourseMaterial(courseId, formData);
        setSuccess('Material creado correctamente.');
      }

      setModalOpen(false);
      setEditingMaterial(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar el material');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (materialId) => {
    const confirmed = window.confirm('Esta accion eliminara el material. Deseas continuar?');
    if (!confirmed) return;

    try {
      setError('');
      setSuccess('');
      await deleteCourseMaterial(courseId, materialId);
      setSuccess('Material eliminado correctamente.');
      setMaterials((prev) => prev.filter((item) => item._id !== materialId));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar el material');
    }
  };

  const onOpen = async (material) => {
    window.open(`http://localhost:5000${material.filePath}`, '_blank');
  };

  const onDownload = async (material) => {
    window.open(`http://localhost:5000${material.filePath}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-[#0A2E57]">Materiales del Curso</h2>
        <button type="button" onClick={openUpload} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg">
          Subir material
        </button>
      </div>

      <section className="bg-white rounded-2xl shadow p-4">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            placeholder="Filtrar por area"
            value={filters.area}
            onChange={(event) => setFilters((prev) => ({ ...prev, area: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
          <input
            placeholder="Filtrar por competencia"
            value={filters.competencia}
            onChange={(event) => setFilters((prev) => ({ ...prev, competencia: event.target.value }))}
            className="border rounded-lg px-3 py-2"
          />
        </div>
      </section>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">{error}</div> : null}
      {success ? <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg">{success}</div> : null}

      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="p-3">Tipo</th>
              <th className="p-3">Titulo</th>
              <th className="p-3">Descripcion</th>
              <th className="p-3">Area</th>
              <th className="p-3">Comp.</th>
              <th className="p-3">Stats</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-3" colSpan="7">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="p-3 text-gray-500" colSpan="7">Sin materiales.</td></tr>
            ) : (
              filtered.map((material) => (
                <tr key={material._id} className="border-b align-top">
                  <td className="p-3"><span className="px-2 py-1 rounded bg-gray-100">{iconForType(material.fileType)}</span></td>
                  <td className="p-3">
                    <p className="font-medium">{material.title}</p>
                    {material.isMandatory ? <span className="text-xs text-red-700">Obligatorio</span> : null}
                  </td>
                  <td className="p-3 max-w-lg">{material.description || '-'}</td>
                  <td className="p-3">{material.area || '-'}</td>
                  <td className="p-3">{material.competencia || '-'}</td>
                  <td className="p-3">
                    <p>open: {material.stats?.openedCount || 0}</p>
                    <p>download: {material.stats?.downloads || 0}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => onOpen(material)} className="bg-blue-600 text-white px-2 py-1 rounded">Abrir</button>
                      <button type="button" onClick={() => onDownload(material)} className="bg-emerald-600 text-white px-2 py-1 rounded">Descargar</button>
                      <button type="button" onClick={() => openEdit(material)} className="bg-gray-700 text-white px-2 py-1 rounded">Editar</button>
                      <button type="button" onClick={() => onDelete(material._id)} className="bg-red-600 text-white px-2 py-1 rounded">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <UploadMaterialModal
        open={modalOpen}
        initialData={editingMaterial}
        submitting={saving}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
          setEditingMaterial(null);
        }}
        onSubmit={onSave}
      />
    </div>
  );
}

export default CourseMaterials;
