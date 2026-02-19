const styles = {
  ok: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-slate-100 text-slate-700'
};

function StatusBadge({ label, tone = 'neutral' }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[tone] || styles.neutral}`}>
      {label}
    </span>
  );
}

export default StatusBadge;
