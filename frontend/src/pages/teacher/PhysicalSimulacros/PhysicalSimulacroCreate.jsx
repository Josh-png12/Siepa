import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPhysicalSimulacro } from '../../../services/api';

function PhysicalSimulacroCreate() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    assignedCourses: '',
    questionCount: 50,
    session: 'SESION_1'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();

    try {
      setLoading(true);
      setError('');

      const payload = {
        title: form.title,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        questionCount: Number(form.questionCount),
        session: form.session,
        assignedCourses: form.assignedCourses
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      };

      const response = await createPhysicalSimulacro(payload);
      navigate(`../${response.simulacro._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo crear simulacro fisico');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-2xl shadow p-6 space-y-4">
      {error ? <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">{error}</div> : null}

      <div className="grid md:grid-cols-2 gap-3">
        <input required placeholder="Titulo" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="border rounded-lg px-3 py-2" />
        <input required type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="border rounded-lg px-3 py-2" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <input required placeholder="Hora inicio (HH:mm)" value={form.startTime} onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))} className="border rounded-lg px-3 py-2" />
        <input required placeholder="Hora fin (HH:mm)" value={form.endTime} onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))} className="border rounded-lg px-3 py-2" />
        <input required type="number" min="1" max="147" value={form.questionCount} onChange={(e) => setForm((p) => ({ ...p, questionCount: e.target.value }))} className="border rounded-lg px-3 py-2" />
      </div>

      <div>
        <label className="text-sm text-slate-600 block mb-1">Sesión ICFES</label>
        <select value={form.session} onChange={(e) => setForm((p) => ({ ...p, session: e.target.value }))} className="w-full border rounded-lg px-3 py-2">
          <option value="SESION_1">Sesión 1 (131 preguntas)</option>
          <option value="SESION_2">Sesión 2 (147 preguntas)</option>
          <option value="AMBAS">Ambas sesiones</option>
        </select>
      </div>

      <input
        required
        placeholder="Cursos asignados (IDs separados por coma)"
        value={form.assignedCourses}
        onChange={(e) => setForm((p) => ({ ...p, assignedCourses: e.target.value }))}
        className="w-full border rounded-lg px-3 py-2"
      />

      <button type="submit" disabled={loading} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
        {loading ? 'Guardando...' : 'Crear simulacro fisico'}
      </button>
    </form>
  );
}

export default PhysicalSimulacroCreate;
