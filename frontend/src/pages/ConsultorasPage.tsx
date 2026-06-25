import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout/Layout';
import { SalesDetailModal } from '../components/Sales/SalesDetailModal';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import api from '../utils/api';
import { SubordinateData } from '../types';
import { formatCurrency, formatPercent } from '../utils/formatters';

type SortKey = 'name' | 'totalSales' | 'achievementPercent';

export function ConsultorasPage() {
  const [consultoras, setConsultoras] = useState<SubordinateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalSales');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  useEffect(() => { fetchConsultoras(); }, []);

  const fetchConsultoras = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ data: SubordinateData[] }>(
        `/dashboard/subordinates?month=${month}&year=${year}&limit=100`
      );
      setConsultoras(data.data);
    } catch {
      setError('Error cargando consultoras.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...consultoras]
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const val = sortAsc ? 1 : -1;
      if (sortKey === 'name') return a.name.localeCompare(b.name) * val;
      return (a[sortKey] - b[sortKey]) * val;
    });

  const getStatusInfo = (pct: number) => {
    if (pct >= 100) return { label: '✓ Meta alcanzada', bg: 'bg-green-50', text: 'text-green-700', bar: '#16a34a' };
    if (pct >= 70) return { label: 'En progreso', bg: 'bg-yellow-50', text: 'text-yellow-700', bar: '#db2777' };
    return { label: 'Bajo meta', bg: 'bg-red-50', text: 'text-red-600', bar: '#f59e0b' };
  };

  // Resumen general
  const totalVentas = consultoras.reduce((s, c) => s + c.totalSales, 0);
  const metaCumplida = consultoras.filter((c) => c.achievementPercent >= 100).length;
  const enProgreso = consultoras.filter((c) => c.achievementPercent >= 70 && c.achievementPercent < 100).length;
  const bajoMeta = consultoras.filter((c) => c.achievementPercent < 70).length;

  if (isLoading) return <LoadingSpinner message="Cargando consultoras..." />;

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <h2 className="text-lg font-bold text-gray-800">Consultoras</h2>
          <p className="text-xs text-gray-500">Desempeño individual de tu unidad — {now.toLocaleString('es-DO', { month: 'long', year: 'numeric' })}</p>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {/* Resumen cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{consultoras.length}</p>
              <p className="text-xs text-gray-500 mt-1">Total consultoras</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{metaCumplida}</p>
              <p className="text-xs text-green-600 mt-1">Meta alcanzada</p>
            </div>
            <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{enProgreso}</p>
              <p className="text-xs text-yellow-600 mt-1">En progreso</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{bajoMeta}</p>
              <p className="text-xs text-red-500 mt-1">Bajo meta</p>
            </div>
          </div>

          {/* Producción total */}
          <div className="bg-pink-50 border border-pink-100 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-pink-600 font-medium uppercase tracking-wide">Producción total del grupo</p>
              <p className="text-2xl font-bold text-pink-700 mt-0.5">{formatCurrency(totalVentas)}</p>
            </div>
            <span className="text-4xl">💄</span>
          </div>

          {/* Filtro y tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Buscar consultora..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300 w-64"
              />
              <p className="text-xs text-gray-400">{sorted.length} consultoras</p>
            </div>

            {sorted.length === 0 ? (
              <div className="py-12 text-center text-gray-400">No se encontraron consultoras</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort('name')}>
                      Nombre {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th className="text-right px-5 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort('totalSales')}>
                      Ventas {sortKey === 'totalSales' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th className="text-right px-5 py-3">Meta</th>
                    <th className="text-left px-5 py-3 min-w-44 cursor-pointer hover:text-gray-700" onClick={() => handleSort('achievementPercent')}>
                      Avance {sortKey === 'achievementPercent' ? (sortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th className="text-center px-5 py-3">Estado</th>
                    <th className="text-center px-5 py-3">Pedidos</th>
                    <th className="text-center px-5 py-3">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((c) => {
                    const status = getStatusInfo(c.achievementPercent);
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-pink-600 text-xs font-bold">{c.name.charAt(0)}</span>
                            </div>
                            <span className="font-medium text-gray-800">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatCurrency(c.totalSales)}</td>
                        <td className="px-5 py-3 text-right text-gray-500">{formatCurrency(c.targetAmount)}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div
                                className="h-2 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(c.achievementPercent, 100)}%`, backgroundColor: status.bar }}
                              />
                            </div>
                            <span className="text-xs font-medium text-gray-600 w-10 text-right">
                              {formatPercent(c.achievementPercent)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center text-gray-600">{c.salesCount}</td>
                        <td className="px-5 py-3 text-center">
                          <button
                            onClick={() => setSelectedUserId(c.sapUserId)}
                            className="text-pink-600 hover:text-pink-800 text-xs font-medium bg-pink-50 hover:bg-pink-100 px-3 py-1 rounded-lg transition-colors"
                          >
                            Ver ventas
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {selectedUserId && (
        <SalesDetailModal
          userId={selectedUserId}
          isOpen={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
        />
      )}
    </Layout>
  );
}
