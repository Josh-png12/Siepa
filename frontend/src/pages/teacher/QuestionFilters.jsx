import { useEffect, useMemo, useState } from 'react';

const AREA_OPTIONS = ['matematicas', 'lectura', 'ciencias', 'sociales', 'ingles'];
const DIFF_OPTIONS = ['baja', 'media', 'alta'];
const CALIB_OPTIONS = ['experimental', 'calibrated'];
const VISIBILITY_OPTIONS = ['private', 'institutional', 'national'];

const defaultState = {
  area: '',
  competencia: '',
  dificultadCualitativa: '',
  bMin: '',
  bMax: '',
  calibrationStatus: '',
  visibility: '',
  creator: '',
  sort1: 'updatedAt:desc',
  sort2: '',
  limit: '20'
};

function QuestionFilters({ value, onApply, onReset, loading }) {
  const [local, setLocal] = useState({ ...defaultState, ...(value || {}) });

  useEffect(() => {
    setLocal({ ...defaultState, ...(value || {}) });
  }, [value]);

  const sortValue = useMemo(() => {
    const sorts = [local.sort1, local.sort2].filter(Boolean);
    return sorts.join(',');
  }, [local.sort1, local.sort2]);

  const handleChange = (event) => {
    const { name, value: inputValue } = event.target;
    setLocal((prev) => ({ ...prev, [name]: inputValue }));
  };

  const submit = (event) => {
    event.preventDefault();
    onApply({
      ...local,
      sort: sortValue,
      page: 1
    });
  };

  const reset = () => {
    const next = { ...defaultState };
    setLocal(next);
    onReset(next);
  };

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl shadow p-6 space-y-4">
      <h3 className="text-xl font-semibold text-[#0A2E57]">Filtros y Ordenamiento</h3>

      <div className="grid md:grid-cols-4 gap-4">
        <select name="area" value={local.area} onChange={handleChange} className="border rounded-lg px-3 py-2">
          <option value="">Area</option>
          {AREA_OPTIONS.map((area) => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>

        <input
          name="competencia"
          value={local.competencia}
          onChange={handleChange}
          placeholder="Competencia"
          className="border rounded-lg px-3 py-2"
        />

        <select
          name="dificultadCualitativa"
          value={local.dificultadCualitativa}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">Dificultad</option>
          {DIFF_OPTIONS.map((diff) => (
            <option key={diff} value={diff}>{diff}</option>
          ))}
        </select>

        <select
          name="calibrationStatus"
          value={local.calibrationStatus}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">Calibracion</option>
          {CALIB_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <select
          name="visibility"
          value={local.visibility}
          onChange={handleChange}
          className="border rounded-lg px-3 py-2"
        >
          <option value="">Visibilidad</option>
          {VISIBILITY_OPTIONS.map((visibility) => (
            <option key={visibility} value={visibility}>{visibility}</option>
          ))}
        </select>

        <input
          name="creator"
          value={local.creator}
          onChange={handleChange}
          placeholder="Creador (ObjectId)"
          className="border rounded-lg px-3 py-2"
        />

        <input
          type="number"
          step="0.1"
          name="bMin"
          value={local.bMin}
          onChange={handleChange}
          placeholder="TRI b minimo"
          className="border rounded-lg px-3 py-2"
        />

        <input
          type="number"
          step="0.1"
          name="bMax"
          value={local.bMax}
          onChange={handleChange}
          placeholder="TRI b maximo"
          className="border rounded-lg px-3 py-2"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <select name="sort1" value={local.sort1} onChange={handleChange} className="border rounded-lg px-3 py-2">
          <option value="updatedAt:desc">Actualizacion desc</option>
          <option value="updatedAt:asc">Actualizacion asc</option>
          <option value="createdAt:desc">Creacion desc</option>
          <option value="triParams.b:asc">TRI b asc</option>
          <option value="triParams.b:desc">TRI b desc</option>
          <option value="dificultadCualitativa:asc">Dificultad asc</option>
          <option value="dificultadCualitativa:desc">Dificultad desc</option>
        </select>

        <select name="sort2" value={local.sort2} onChange={handleChange} className="border rounded-lg px-3 py-2">
          <option value="">Sin segundo orden</option>
          <option value="updatedAt:desc">Actualizacion desc</option>
          <option value="updatedAt:asc">Actualizacion asc</option>
          <option value="triParams.b:asc">TRI b asc</option>
          <option value="triParams.b:desc">TRI b desc</option>
          <option value="calibrationStatus:asc">Calibracion asc</option>
          <option value="visibility:asc">Visibilidad asc</option>
        </select>

        <select name="limit" value={local.limit} onChange={handleChange} className="border rounded-lg px-3 py-2">
          <option value="10">10 por pagina</option>
          <option value="20">20 por pagina</option>
          <option value="50">50 por pagina</option>
        </select>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="bg-[#0A2E57] text-white px-4 py-2 rounded-lg disabled:opacity-60">
          {loading ? 'Aplicando...' : 'Aplicar filtros'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={loading}
          className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg disabled:opacity-60"
        >
          Limpiar
        </button>
      </div>
    </form>
  );
}

export default QuestionFilters;
