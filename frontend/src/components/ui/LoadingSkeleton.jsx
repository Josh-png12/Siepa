function LoadingSkeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className}`.trim()} />;
}

export default LoadingSkeleton;
