import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import { SubordinateData } from '../../types';

interface ProductionChartProps {
  data: SubordinateData[];
}

export function ProductionChart({ data }: ProductionChartProps) {
  const chartData = [...data]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 8)
    .map((s) => ({
      name: s.name.split(' ')[0], // Solo primer nombre
      ventas: s.totalSales,
      meta: s.targetAmount,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Producción por Consultora</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} width={65} />
          <Tooltip
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'ventas' ? 'Compras' : 'Meta',
            ]}
          />
          <Bar dataKey="meta" fill="#fce7f3" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="ventas" fill="#db2777" radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-end">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-pink-600" /> Compras
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <div className="w-3 h-3 rounded-sm bg-pink-100" /> Meta
        </div>
      </div>
    </div>
  );
}
