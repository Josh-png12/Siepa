import { useEffect, useRef } from 'react';

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-orange-500 animate-bounce">
    <path d="M12 23a7.5 7.5 0 0 1-5.138-12.963C8.204 8.774 11.5 6.5 11 1.5c6 4 9 8 3 14 1.5 0 2.5-.5 3.605-1.886A7.5 7.5 0 0 1 12 23z" />
  </svg>
);

export default function StreakCard({ current = 0, longest = 0 }) {
  const isHot = current >= 3;

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-md p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-[#1e3a5f] text-sm uppercase tracking-widest">Tu racha</h2>
        {isHot ? (
          <FlameIcon />
        ) : (
          <span className="text-2xl select-none">🔥</span>
        )}
      </div>

      {current === 0 ? (
        <div className="text-center py-4">
          <p className="text-slate-400 text-sm">¡Completa un simulacro hoy</p>
          <p className="text-slate-400 text-sm">para empezar tu racha! 💪</p>
        </div>
      ) : (
        <div className="text-center">
          <p className={`text-6xl font-black leading-none ${isHot ? 'text-orange-500' : 'text-[#1e3a5f]'}`}>
            {current}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {current === 1 ? 'día seguido' : 'días seguidos'}
          </p>
        </div>
      )}

      {longest > 0 && (
        <p className="text-center text-xs text-slate-400 border-t border-slate-100 pt-2">
          Récord personal: <span className="font-bold text-[#1e3a5f]">{longest}</span> días
        </p>
      )}
    </article>
  );
}
