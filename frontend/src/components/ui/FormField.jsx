function FormField({
  id,
  label,
  icon,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  autoComplete,
  disabled = false,
  error = '',
  rightAdornment,
  inputProps = {}
}) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-white py-3 pl-10 pr-11 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A2E57] ${
            error ? 'border-red-300 focus-visible:ring-red-400' : 'border-slate-200'
          } ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}
          {...inputProps}
        />
        {rightAdornment ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{rightAdornment}</span>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default FormField;
