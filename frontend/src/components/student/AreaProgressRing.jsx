import { useState } from 'react';

const AREA_LABELS = {
  LECTURA_CRITICA: 'Lectura Crítica',
  MATEMATICAS: 'Matemáticas',
  CIENCIAS_NATURALES: 'Ciencias Naturales',
  CIENCIAS_SOCIALES: 'Ciencias Sociales',
  INGLES: 'Inglés'
};

const AREA_COLORS = {
  LECTURA_CRITICA: '#7c3aed',
  MATEMATICAS: '#2563eb',
  CIENCIAS_NATURALES: '#059669',
  CIENCIAS_SOCIALES: '#d97706',
  INGLES: '#dc2626'
};

const scoreColor = (score) => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-500';
  return 'text-red-500';
};

const ringColor = (score) => {
  if (score >= 80) return '#059669';
  if (score >= 50) return '#d97706';
  return '#ef4444';
};

function ProgressRing({ score, area }) {
  const [tooltip, setTooltip] = useState(false);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const fill = Math.min(score / 100, 1);
  const offset = circumference * (1 - fill);
  const color = ringColor(score);

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className="relative cursor-pointer"
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
      >
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
          <circle
            cx="48" cy="48" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-black ${scoreColor(score)}`}>
            {score > 0 ? Math.round(score) : '—'}
          </span>
        </div>

        {tooltip && (
          <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
            <p>Último: <strong>{Math.round(score)}%</strong></p>
          </div>
        )}
      </div>

      <p className="text-xs font-semibold text-slate-600 text-center leading-tight max-w-[96px]">
        {AREA_LABELS[area] || area}
      </p>
    </div>
  );
}

export default function AreaProgressRing({ areas = [] }) {
  if (!areas.length) {
    return (
      <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
        <h2 className="font-bold text-[#1e3a5f] mb-4">Progreso por área ICFES</h2>
        <div className="flex flex-col items-center py-6 gap-2 text-slate-400">
          <span className="text-4xl">📚</span>
          <p className="text-sm text-center">Completa simulacros para ver tu progreso por área</p>
        </div>
      </article>
    );
  }

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-[#1e3a5f]">Progreso por área ICFES</h2>
        <span className="text-xs text-slate-400">% correcto último simulacro</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 justify-items-center">
        {areas.map((ap) => (
          <ProgressRing key={ap.area} score={ap.lastScore} area={ap.area} />
        ))}
      </div>
    </article>
  );
}
