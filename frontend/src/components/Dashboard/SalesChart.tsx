import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

interface SalesChartProps {
  data: { date: string; amount: number }[];
}

export function SalesChart({ data }: SalesChartProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Compras últimos 30 días</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v) => v.slice(5)} // MM-DD
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [formatCurrency(value), 'Compras']}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="amount"
            stroke="#db2777"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#db2777' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
