// Botón base del design system SIEPA.
//
// Nota de accesibilidad: accent.DEFAULT (#E8543F) y secondary.DEFAULT (#0EA5A0)
// con texto blanco dan 3.64:1 y 3.04:1 de contraste — no cumplen WCAG AA para
// texto normal de botón (se necesita 4.5:1; solo califican como "large text").
// Por eso el relleno sólido real de los botones usa el tono `-dark` de cada
// color (accent-dark 5.19:1, secondary-dark 5.17:1) y las variantes DEFAULT/light
// quedan para hover, iconos, badges con texto oscuro o texto grande (≥18.66px bold).
const VARIANTS = {
  primary: 'bg-accent-dark text-white hover:brightness-90 focus-visible:ring-accent-dark',
  secondary: 'bg-transparent text-primary border-2 border-primary hover:bg-primary/5 focus-visible:ring-primary',
  brand: 'bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary',
};

function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 font-sans font-semibold text-sm shadow-[0_16px_32px_-16px_rgba(11,61,92,0.45)] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${VARIANTS[variant] || VARIANTS.primary} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
