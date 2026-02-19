function Spinner({ className = 'h-4 w-4', label = 'Cargando' }) {
  return (
    <span className="inline-flex items-center" role="status" aria-label={label}>
      <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default Spinner;
