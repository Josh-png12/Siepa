// frontend/src/pages/Simulacro.js
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getBooklet } from '../services/api';

function Simulacro() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booklet, setBooklet] = useState(null);
  const [respuestas, setRespuestas] = useState({}); // {1: 'A', 2: 'C', ...}
  const [tiempoRestante, setTiempoRestante] = useState(180 * 60); // 3 horas en segundos
  const [preguntaActual, setPreguntaActual] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const cargar = async () => {
      const data = await getBooklet(id);
      setBooklet(data);
      setTiempoRestante(data.duration * 60);
    };
    cargar();

    timerRef.current = setInterval(() => {
      setTiempoRestante(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          finalizarSimulacro();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [id]);

  const seleccionarRespuesta = (numPregunta, letra) => {
    setRespuestas(prev => ({ ...prev, [numPregunta]: letra }));
  };

  const finalizarSimulacro = () => {
    // Aquí luego enviaremos respuestas al backend para TRI
    alert("¡Simulacro finalizado! (Próximamente verás tus resultados aquí)");
    navigate('/dashboard');
  };

  const formatoTiempo = (segundos) => {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!booklet) return <div className="text-center mt-20">Cargando simulacro...</div>;

  const pregunta = booklet.questions[preguntaActual];

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      {/* Header estilo ICFES real */}
      <div className="bg-white border-b shadow-sm py-3 px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/icfes-logo.png" alt="ICFES" className="h-10" /> {/* Puedes poner una imagen real */}
          <div>
            <div className="text-[#002855] font-bold text-xl">SABER 11°</div>
            <div className="text-xs text-gray-500 -mt-1">SIMULACRO H01 • SIEPA</div>
          </div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-mono font-bold text-red-600 tracking-widest">
            {formatoTiempo(tiempoRestante)}
          </div>
          <div className="text-xs text-gray-500">TIEMPO RESTANTE</div>
        </div>

        <div className="text-right">
          <div className="font-medium">Estudiante: {booklet.studentName || 'Juan Pérez'}</div>
          <div className="text-xs text-gray-500">Cuadernillo: {booklet.title}</div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Pregunta */}
        <div className="flex-1 p-10 overflow-auto bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-[#002855] text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-2xl">
                {preguntaActual + 1}
              </div>
              <div className="text-sm text-gray-500">Pregunta {preguntaActual + 1} de {booklet.questions.length}</div>
            </div>

            <p className="text-xl leading-relaxed text-gray-800 mb-10">
              {pregunta.questionText}
            </p>

            <div className="space-y-4">
              {pregunta.options.map((opcion, idx) => {
                const letra = String.fromCharCode(65 + idx); // A, B, C, D
                const seleccionada = respuestas[preguntaActual + 1] === letra;

                return (
                  <div
                    key={idx}
                    onClick={() => seleccionarRespuesta(preguntaActual + 1, letra)}
                    className={`flex items-start gap-4 p-5 border-2 rounded-2xl cursor-pointer transition-all hover:bg-blue-50
                      ${seleccionada ? 'border-[#002855] bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-lg flex-shrink-0
                      ${seleccionada ? 'bg-[#002855] text-white border-[#002855]' : 'border-gray-400'}`}>
                      {letra}
                    </div>
                    <p className="text-lg leading-relaxed">{opcion}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hoja de respuestas digital (lado derecho) */}
        <div className="w-96 bg-[#f1f5f9] border-l overflow-auto p-6">
          <div className="text-center mb-6">
            <div className="text-[#002855] font-bold text-xl">HOJA DE RESPUESTAS</div>
            <div className="text-xs text-gray-500">SABER 11° - SIMULACRO</div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-sm">
            {booklet.questions.map((_, idx) => {
              const num = idx + 1;
              const seleccionada = respuestas[num];
              return (
                <div
                  key={num}
                  onClick={() => setPreguntaActual(idx)}
                  className={`h-10 flex items-center justify-center border rounded-lg font-mono text-base cursor-pointer transition-all
                    ${seleccionada ? 'bg-[#002855] text-white' : 'bg-white border-gray-300 hover:bg-gray-100'}`}
                >
                  {num}
                  {seleccionada && <span className="ml-1 text-xs">({seleccionada})</span>}
                </div>
              );
            })}
          </div>

          <button
            onClick={finalizarSimulacro}
            className="mt-10 w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-bold text-lg tracking-wider shadow"
          >
            FINALIZAR SIMULACRO
          </button>
        </div>
      </div>
    </div>
  );
}

export default Simulacro;