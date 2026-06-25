interface OverviewCardProps {
  title: string;
  value: string;
  subtitle?: string;
  change?: { value: string; positive: boolean };
  iconBg: string;
  icon: string;
}

export function OverviewCard({ title, value, subtitle, change, iconBg, icon }: OverviewCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-start gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{title}</p>
        <p className="text-xl font-bold text-gray-800 mt-0.5 truncate">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        {change && (
          <p className={`text-xs font-semibold mt-1 ${change.positive ? 'text-green-600' : 'text-red-500'}`}>
            {change.positive ? '↑' : '↓'} {change.value}
          </p>
        )}
      </div>
    </div>
  );
}
