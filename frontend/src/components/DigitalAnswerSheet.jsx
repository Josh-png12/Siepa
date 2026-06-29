import { useState, useEffect } from 'react';

function DigitalAnswerSheet({ totalQuestions = 120, selectedAnswers = {}, onAnswerSelect }) {
  const [marked, setMarked] = useState(new Set());

  const toggleMark = (num) => {
    setMarked(prev => {
      const newSet = new Set(prev);
      if (newSet.has(num)) newSet.delete(num);
      else newSet.add(num);
      return newSet;
    });
  };

  return (
    <div className="bg-white border border-gray-300 shadow-xl rounded-2xl overflow-hidden w-full max-w-[380px]">
      {/* Header estilo ICFES oficial */}
      <div className="bg-[#002855] text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#002855] w-10 h-10 rounded-xl flex items-center justify-center font-black text-2xl">S</div>
          <div>
            <div className="text-xl font-bold tracking-tighter">SIEPA</div>
            <div className="text-[10px] opacity-75 -mt-1">SABER 11° • H01</div>
          </div>
        </div>
        <div className="text-right text-xs">
          <div>PRIMERA SESIÓN</div>
          <div className="text-[10px] opacity-75">SIMULACRO DIGITAL</div>
        </div>
      </div>

      {/* Campos superiores */}
      <div className="bg-[#e0f2fe] p-4 grid grid-cols-3 gap-3 text-[11px] border-b">
        <div>
          <div className="text-[#002855] font-bold">APELLIDOS Y NOMBRES</div>
          <div className="h-6 bg-white mt-1 rounded border border-gray-300"></div>
        </div>
        <div>
          <div className="text-[#002855] font-bold">No. REGISTRO</div>
          <div className="h-6 bg-white mt-1 rounded border border-gray-300"></div>
        </div>
        <div>
          <div className="text-[#002855] font-bold">No. CUADERNILLO</div>
          <div className="h-6 bg-white mt-1 rounded border border-gray-300"></div>
        </div>
      </div>

      {/* Hoja de respuestas */}
      <div className="p-5 bg-white">
        <div className="text-center bg-[#002855] text-white text-sm font-bold py-2 rounded mb-6">
          PRIMERA SESIÓN
        </div>

        <div className="grid grid-cols-4 gap-x-6 gap-y-8">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const num = i + 1;
            const selected = selectedAnswers[num];
            const isMarked = marked.has(num);

            return (
              <div key={num} className="flex flex-col items-center">
                <div className="text-[11px] font-mono text-gray-500 mb-1.5">{num}</div>

                <div className="grid grid-cols-4 gap-1.5">
                  {['A', 'B', 'C', 'D'].map(letter => {
                    const isSelected = selected === letter;
                    return (
                      <div
                        key={letter}
                        onClick={() => onAnswerSelect(num, letter)}
                        className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-pointer transition-all
                          ${isSelected 
                            ? 'bg-[#002855] text-white border-[#002855] scale-110' 
                            : 'border-gray-400 hover:border-[#002855] hover:bg-blue-50'}`}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>

                {isMarked && <div className="text-[10px] text-orange-600 mt-1">★</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-100 py-3 text-center text-[10px] text-gray-500 border-t">
        SIEPA • Simulador Saber 11°
      </div>
    </div>
  );
}

export default DigitalAnswerSheet;