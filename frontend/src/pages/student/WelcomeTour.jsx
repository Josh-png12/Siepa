import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';

const TOUR_KEY = 'siepa_tour_done';

const STUDENT_STEPS = [
  {
    icon: '🏠',
    title: 'Tu Dashboard personal',
    description: 'Aquí ves tu progreso en tiempo real: nivel ICFES, percentil, simulacros completados y tu evolución semanal.',
  },
  {
    icon: '📝',
    title: 'Simulacros',
    description: 'Aquí encontrarás los exámenes que tu docente publica. Puedes iniciarlos, reanudarlos y ver sus resultados.',
  },
  {
    icon: '📈',
    title: 'Tu Progreso',
    description: 'Verás cómo evoluciona tu nivel ICFES a lo largo del tiempo, tu desempeño por área y señales de riesgo cognitivo.',
  },
  {
    icon: '🗺️',
    title: 'Plan de Estudio',
    description: 'Tu ruta de aprendizaje personalizada según tus debilidades. Se actualiza automáticamente después de cada simulacro.',
  },
  {
    icon: '✨',
    title: 'Explicaciones con IA',
    description: 'Cuando termines un simulacro, la IA te explica cada respuesta incorrecta con razonamiento paso a paso.',
  },
];

const TEACHER_STEPS = [
  {
    icon: '📚',
    title: 'Banco de Preguntas',
    description: 'Crea, edita y organiza preguntas por área ICFES. También puedes generar preguntas automáticamente con IA.',
  },
  {
    icon: '📝',
    title: 'Simulacros',
    description: 'Publica simulacros virtuales para tus cursos. Los estudiantes los ven en tiempo real y tú controlas el flujo.',
  },
  {
    icon: '📷',
    title: 'OCR — Hojas físicas',
    description: 'Sube fotos de hojas de respuestas físicas. El sistema detecta las burbujas automáticamente y califica al instante.',
  },
  {
    icon: '📊',
    title: 'Resultados e Insights',
    description: 'Analiza el desempeño de tus cursos, identifica áreas débiles colectivas y exporta reportes.',
  },
  {
    icon: '✨',
    title: 'IA integrada',
    description: 'Genera preguntas ICFES de calidad con un clic. La IA sigue los lineamientos exactos del examen Saber 11.',
  },
];

function WelcomeTour() {
  const { user } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      setVisible(true);
    }
  }, []);

  const steps = user?.role === 'docente' ? TEACHER_STEPS : STUDENT_STEPS;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const close = () => {
    localStorage.setItem(TOUR_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center pt-6 px-6">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-8 bg-[#1e3a5f]' : 'w-2 bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 pt-6 pb-4 text-center">
          <div className="text-6xl mb-4 select-none">{current.icon}</div>
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-2">{current.title}</h2>
          <p className="text-slate-600 leading-relaxed text-sm">{current.description}</p>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-slate-400 pb-2">
          {step + 1} de {steps.length}
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3 px-8 pb-8">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Anterior
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="flex-1 rounded-xl bg-[#1e3a5f] py-2.5 text-sm font-semibold text-white hover:bg-[#162d4a] transition-colors"
            >
              Siguiente →
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="flex-1 rounded-xl bg-gradient-to-r from-[#1e3a5f] to-[#3b82f6] py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              ¡Entendido, empecemos! 🚀
            </button>
          )}
        </div>

        {/* Skip */}
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xl leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default WelcomeTour;
