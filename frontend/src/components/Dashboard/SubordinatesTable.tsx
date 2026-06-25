import { useState } from 'react';
import { SubordinateData } from '../../types';
import { formatCurrency, formatPercent } from '../../utils/formatters';
import { SalesDetailModal } from '../Sales/SalesDetailModal';

interface SubordinatesTableProps {
  data: SubordinateData[];
  unitName?: string | null;
}

export function SubordinatesTable({ data, unitName }: SubordinatesTableProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = data.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const getAchievementColor = (pct: number) => {
    if (pct >= 100) return 'text-green-700 bg-green-50';
    if (pct >= 70) return 'text-yellow-700 bg-yellow-50';
    return 'text-red-700 bg-red-50';
  };

  const getBarWidth = (pct: number) => `${Math.min(pct, 100)}%`;
  const getBarColor = (pct: number) => pct >= 100 ? '#16a34a' : pct >= 70 ? '#db2777' : '#f59e0b';

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 shadow-sm">
        No tienes consultoras asignadas
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
              <h3 className="font-semibold text-gray-800">Mis Consultoras</h3>
              {unitName && <p className="text-xs text-pink-500 font-medium">✨ {unitName}</p>}
            </div>
          <input
            type="text"
            placeholder="Buscar consultora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300 w-48"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-5 py-3">Nombre</th>
                <th className="text-right px-5 py-3">Ventas</th>
                <th className="text-right px-5 py-3">Meta</th>
                <th className="text-left px-5 py-3 min-w-40">Avance</th>
                <th className="text-center px-5 py-3">Estado</th>
                <th className="text-center px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-pink-600 text-xs font-bold">{row.name.charAt(0)}</span>
                      </div>
                      <span className="font-medium text-gray-800">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatCurrency(row.totalSales)}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{formatCurrency(row.targetAmount)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{ width: getBarWidth(row.achievementPercent), backgroundColor: getBarColor(row.achievementPercent) }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-600 w-10 text-right">
                        {formatPercent(row.achievementPercent)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${getAchievementColor(row.achievementPercent)}`}>
                      {row.achievementPercent >= 100 ? '✓ Meta' : row.achievementPercent >= 70 ? 'En progreso' : 'Bajo meta'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => setSelectedUserId(row.sapUserId)}
                      className="text-pink-600 hover:text-pink-800 text-xs font-medium bg-pink-50 hover:bg-pink-100 px-3 py-1 rounded-lg transition-colors"
                    >
                      Ver ventas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
          {filtered.length} de {data.length} consultoras
        </div>
      </div>

      {selectedUserId && (
        <SalesDetailModal
          userId={selectedUserId}
          isOpen={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </>
  );
}
