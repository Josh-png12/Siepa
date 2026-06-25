import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentGetSimulacros } from '../../services/api';
import LoadingSkeleton from '../../components/ui/LoadingSkeleton';
import ErrorState from '../../components/ui/ErrorState';

const TABS = [
  { id: 'available', label: 'Disponibles', emoji: '📋' },
  { id: 'inProgress', label: 'En curso', emoji: '⏳' },
  { id: 'completed', label: 'Completados', emoji: '✅' },
];

// Area → color mapping
const AREA_COLORS = {
  'Lectura Crítica': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'lectura':         { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Matemáticas':     { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  'matematicas':     { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Ciencias Naturales': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'ciencias':        { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'Ciencias Sociales': { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  'sociales':        { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
  'Inglés':          { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
  'ingles':          { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const DIFICULTAD_COLORS = {
  'baja':   'bg-emerald-100 text-emerald-700',
  'fácil':  'bg-emerald-100 text-emerald-700',
  'media':  'bg-amber-100 text-amber-700',
  'alta':   'bg-red-100 text-red-700',
  'difícil':'bg-red-100 text-red-700',
};

function areaColor(area) {
  return AREA_COLORS[area] || { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
}

// ── Empty SVGs ────────────────────────────────────────────────────────────────
function EmptyAvailable() {
  return (
    <div className="flex flex-col items-center py-12 text-center gap-4">
      <svg className="w-20 h-20 text-blue-100" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="10" y="16" width="60" height="52" rx="8" />
        <path d="M10 30h60M26 10v12M54 10v12" strokeLinecap="round" />
        <path d="M25 44h6M25 52h6M39 44h16M39 52h10" strokeLinecap="round" />
      </svg>
      <div>
        <p className="text-lg font-bold text-slate-700">No hay simulacros disponibles</p>
        <p className="text-sm text-slate-400 mt-1">Tu docente publicará uno pronto. ¡Mantente listo! 💪</p>
      </div>
    </div>
  );
}

function EmptyInProgress() {
  return (
    <div className="flex flex-col items-center py-12 text-center gap-4">
      <svg className="w-20 h-20 text-amber-100" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="40" cy="40" r="28" />
        <path d="M40 24v18l10 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <p className="text-lg font-bold text-slate-700">No tienes simulacros en curso</p>
        <p className="text-sm text-slate-400 mt-1">Inicia uno desde la pestaña Disponibles</p>
      </div>
    </div>
  );
}

function EmptyCompleted() {
  return (
    <div className="flex flex-col items-center py-12 text-center gap-4">
      <svg className="w-20 h-20 text-emerald-100" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="40" cy="40" r="28" />
        <path d="M28 40l8 8 16-16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <p className="text-lg font-bold text-slate-700">Aún no completaste ningún simulacro</p>
        <p className="text-sm text-slate-400 mt-1">Cuando finalices uno, verás tus resultados aquí 🚀</p>
      </div>
    </div>
  );
}

const EMPTY_BY_TAB = {
  available: EmptyAvailable,
  inProgress: EmptyInProgress,
  completed: EmptyCompleted,
};

// ── Simulacro card ────────────────────────────────────────────────────────────
function SimulacroCard({ item, tabId, onNavigate }) {
  const ac = areaColor(item.area);
  const diffStyle = DIFICULTAD_COLORS[item.dificultad] || 'bg-slate-100 text-slate-600';

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 p-5">
      {/* Header badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {item.area && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ac.bg} ${ac.text} ${ac.border}`}>
            {item.area}
          </span>
        )}
        {item.dificultad && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${diffStyle}`}>
            {item.dificultad}
          </span>
        )}
        {tabId === 'available' && (
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
            Listo
          </span>
        )}
        {tabId === 'inProgress' && (
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            En curso
          </span>
        )}
        {tabId === 'completed' && (
          <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Finalizado
          </span>
        )}
      </div>

      <p className="font-bold text-slate-800 text-base">{item.title}</p>
      {item.description && (
        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.description}</p>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
        {item.questionCount && <span>📝 {item.questionCount} preguntas</span>}
        {item.duration && <span>⏱ {item.duration} min</span>}
      </div>

      <div className="mt-4">
        {tabId === 'available' && (
          <button
            type="button"
            onClick={() => onNavigate(`/simulacros/${item.id}/take`)}
            className="w-full rounded-xl bg-[#1e3a5f] text-white py-2.5 text-sm font-semibold hover:bg-[#162d4a] transition-colors"
          >
            Iniciar simulacro →
          </button>
        )}
        {tabId === 'inProgress' && (
          <button
            type="button"
            onClick={() => onNavigate(`/simulacros/${item.id}/take`)}
            className="w-full rounded-xl bg-amber-500 text-white py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors"
          >
            Reanudar →
          </button>
        )}
        {tabId === 'completed' && (
          <button
            type="button"
            onClick={() => onNavigate(`/simulacros/${item.id}/results`)}
            className="w-full rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            Ver resultado →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
function StudentSimulacros() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('available');
  const [data, setData] = useState({ items: [], physicalReadOnly: [], pagination: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await studentGetSimulacros({ status: activeTab, page: 1, limit: 30 });
      setData(res.data || { items: [], physicalReadOnly: [], pagination: {} });
      setError('');
    } catch (err) {
      const d = err.response?.data?.errors;
      setError(Array.isArray(d) && d.length ? d.join(' | ') : 'No se pudieron cargar simulacros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeTab]);

  const EmptyComp = EMPTY_BY_TAB[activeTab] || EmptyAvailable;

  if (error) {
    return <ErrorState title="No se pudo cargar" description={error} actionLabel="Reintentar" onAction={load} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#1e3a5f]">Simulacros</h1>
        <p className="text-sm text-slate-400 mt-1">Presenta exámenes virtuales y consulta el estado de los físicos.</p>
      </div>

      {/* Pill tabs */}
      <div className="flex gap-2 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-[#1e3a5f] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Virtual simulacros */}
      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Virtuales</h2>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1,2,3].map((i) => <LoadingSkeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        ) : (data.items || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <EmptyComp />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((item) => (
              <SimulacroCard
                key={item.id}
                item={item}
                tabId={activeTab}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}
      </section>

      {/* Physical simulacros */}
      <section>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">Físicos (solo lectura)</h2>
        {(data.physicalReadOnly || []).length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex flex-col items-center py-10 text-center gap-3">
              <svg className="w-14 h-14 text-slate-200" fill="none" viewBox="0 0 64 64" stroke="currentColor" strokeWidth={1.5}>
                <rect x="8" y="8" width="48" height="48" rx="6" />
                <path d="M20 32h24M20 40h16" strokeLinecap="round" />
                <circle cx="44" cy="22" r="8" className="fill-slate-100" />
                <path d="M41 22l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm font-semibold text-slate-600">Sin hojas OCR procesadas</p>
              <p className="text-xs text-slate-400">Cuando tu institución suba hojas de respuestas, aparecerán aquí.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.physicalReadOnly.map((item) => {
              const tone = item.statusLabel === 'publicado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : item.statusLabel === 'en revision' ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-slate-50 text-slate-600 border-slate-200';
              return (
                <div key={`${item.source}-${item.id}`}
                  className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-800">{item.title}</p>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${tone}`}>
                      {item.statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {item.questionCount} preguntas · {item.courses?.join(', ') || 'Sin curso'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default StudentSimulacros;
