import { formatCurrency, formatPercent } from '../../utils/formatters';

interface GoalThermometerProps {
  totalSales: number;
  targetAmount: number;
  achievementPercent: number;
}

export function GoalThermometer({ totalSales, targetAmount, achievementPercent }: GoalThermometerProps) {
  const pct = Math.min(achievementPercent, 100);
  const fillColor = pct >= 100 ? '#16a34a' : pct >= 70 ? '#db2777' : '#f59e0b';
  const remaining = Math.max(targetAmount - totalSales, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Termómetro de Meta</h3>

      <div className="flex gap-5 items-start">
        {/* Termómetro SVG */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <svg width="48" height="160" viewBox="0 0 48 160">
            {/* Marcas */}
            {[0, 25, 50, 75, 100].map((mark) => {
              const y = 120 - (mark / 100) * 100;
              return (
                <g key={mark}>
                  <line x1="28" y1={y} x2="34" y2={y} stroke="#d1d5db" strokeWidth="1" />
                  <text x="24" y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{mark}%</text>
                </g>
              );
            })}

            {/* Tubo fondo */}
            <rect x="34" y="20" width="10" height="100" rx="5" fill="#f3f4f6" />

            {/* Tubo relleno */}
            <rect
              x="34"
              y={20 + (100 - pct)}
              width="10"
              height={pct}
              rx="5"
              fill={fillColor}
              style={{ transition: 'all 0.8s ease' }}
            />

            {/* Bulbo */}
            <circle cx="39" cy="130" r="10" fill="#f3f4f6" />
            <circle cx="39" cy="130" r="7" fill={fillColor} style={{ transition: 'fill 0.8s ease' }} />
          </svg>

          <span className="text-lg font-bold mt-1" style={{ color: fillColor }}>
            {formatPercent(pct)}
          </span>
        </div>

        {/* Info cards */}
        <div className="flex-1 space-y-2.5">
          <div className="bg-pink-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Meta del Mes</p>
            <p className="text-base font-bold text-gray-800">{formatCurrency(targetAmount)}</p>
          </div>
          <div className="bg-pink-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Producido</p>
            <p className="text-base font-bold text-pink-600">{formatCurrency(totalSales)}</p>
            <p className="text-xs font-semibold text-pink-500">{formatPercent(achievementPercent)}</p>
          </div>
          {remaining > 0 ? (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Faltante</p>
              <p className="text-base font-bold text-amber-600">{formatCurrency(remaining)}</p>
            </div>
          ) : (
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Estado</p>
              <p className="text-base font-bold text-green-600">¡Meta alcanzada! 🎉</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
