function StatsCard({ title, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-md hover:shadow-lg transition">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`text-4xl font-bold mt-2 ${color}`}>
        {value}
      </p>
    </div>
  );
}

export default StatsCard;