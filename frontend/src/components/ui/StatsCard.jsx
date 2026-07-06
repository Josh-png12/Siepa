function StatsCard({ title, value, color }) {
  return (
    <div className="bg-background-card rounded-2xl p-4 md:p-6 shadow-[0_20px_45px_-24px_rgba(11,61,92,0.35)] hover:shadow-[0_25px_55px_-20px_rgba(11,61,92,0.4)] transition-shadow duration-200">
      <p className="text-xs md:text-sm font-sans font-medium text-text-secondary">{title}</p>
      <p className={`font-heading text-2xl md:text-4xl font-black mt-2 ${color || 'text-primary'}`}>
        {value}
      </p>
    </div>
  );
}

export default StatsCard;
