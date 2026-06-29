import { useEffect, useRef } from 'react';

const BADGE_ICONS = {
  trophy: '🏆',
  flame: '🔥',
  star: '⭐',
  sparkle: '✨',
  'trending-up': '📈',
  medal: '🥇'
};

const ALL_BADGE_DEFS = [
  { key: 'FIRST_SIMULACRO', name: 'Primer paso', description: 'Completaste tu primer simulacro', icon: 'trophy' },
  { key: 'STREAK_7', name: 'Semana constante', description: '7 días seguidos practicando', icon: 'flame' },
  { key: 'STREAK_30', name: 'Mes de fuego', description: '30 días seguidos practicando', icon: 'star' },
  { key: 'FIRST_PERFECT', name: 'Puntaje perfecto', description: '100% en un área', icon: 'sparkle' },
  { key: 'IMPROVEMENT_10', name: 'En ascenso', description: '+10 puntos vs simulacro anterior', icon: 'trending-up' },
  { key: 'MASTERY_LECTURA_CRITICA', name: 'Dominio Lectura', description: '80%+ en Lectura Crítica', icon: 'medal' },
  { key: 'MASTERY_MATEMATICAS', name: 'Dominio Matemáticas', description: '80%+ en Matemáticas', icon: 'medal' },
  { key: 'MASTERY_CIENCIAS_NATURALES', name: 'Dominio Ciencias Nat.', description: '80%+ en Ciencias Naturales', icon: 'medal' },
  { key: 'MASTERY_CIENCIAS_SOCIALES', name: 'Dominio Ciencias Soc.', description: '80%+ en Ciencias Sociales', icon: 'medal' },
  { key: 'MASTERY_INGLES', name: 'Dominio Inglés', description: '80%+ en Inglés', icon: 'medal' }
];

function BadgeTile({ def, earned, isNew }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isNew || !ref.current) return;
    ref.current.classList.add('animate-bounce-once');
    const t = setTimeout(() => ref.current?.classList.remove('animate-bounce-once'), 600);
    return () => clearTimeout(t);
  }, [isNew]);

  const icon = BADGE_ICONS[def.icon] || '🏅';

  return (
    <div
      ref={ref}
      title={def.description}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-300 ${
        earned
          ? isNew
            ? 'bg-amber-50 border-amber-300 shadow-md scale-105'
            : 'bg-slate-50 border-slate-200'
          : 'bg-slate-50 border-slate-100 opacity-40 grayscale'
      }`}
    >
      <span className="text-2xl select-none">{icon}</span>
      <p className="text-[10px] font-semibold text-slate-700 text-center leading-tight line-clamp-2">
        {def.name}
      </p>
      {isNew && (
        <span className="text-[9px] bg-amber-400 text-white font-bold px-1.5 py-0.5 rounded-full">¡Nuevo!</span>
      )}
    </div>
  );
}

export default function BadgesGrid({ earnedBadges = [], newBadgeKeys = [], showAll = false }) {
  const earnedKeys = new Set(earnedBadges.map(b => b.badgeKey));
  const newKeys = new Set(newBadgeKeys);

  const visibleDefs = showAll ? ALL_BADGE_DEFS : ALL_BADGE_DEFS.slice(0, 6);

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-[#1e3a5f]">Insignias</h2>
        <span className="text-xs text-slate-400">{earnedKeys.size}/{ALL_BADGE_DEFS.length} desbloqueadas</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {visibleDefs.map(def => (
          <BadgeTile
            key={def.key}
            def={def}
            earned={earnedKeys.has(def.key)}
            isNew={newKeys.has(def.key)}
          />
        ))}
      </div>
    </article>
  );
}
