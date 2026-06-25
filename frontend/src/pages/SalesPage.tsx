import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { Sale, PaginatedResponse } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

const statusLabel: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completada', color: 'text-green-700 bg-green-50' },
  pending: { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-50' },
  cancelled: { label: 'Cancelada', color: 'text-red-700 bg-red-50' },
};

export function SalesPage() {
  const { user } = useAuthStore();
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => { fetchSales(); }, [page, startDate, endDate, status]);

  const fetchSales = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (status) params.append('status', status);

      const { data } = await api.get<PaginatedResponse<Sale>>(`/sales?${params}`);
      setSales(data.data);
      setTotal(data.total);
    } catch {
      setError('Error cargando ventas.');
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const totalAmount = sales.reduce((sum, s) => s.status !== 'cancelled' ? sum + s.amount : sum, 0);

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <h2 className="text-lg font-bold text-gray-800">Ventas y Producción</h2>
          <p className="text-xs text-gray-500">Historial de ventas de {user?.name}</p>
        </div>

        <div className="flex-1 p-6 space-y-4 max-w-7xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300"
              >
                <option value="">Todos</option>
                <option value="completed">Completadas</option>
                <option value="pending">Pendientes</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>
            <button
              onClick={() => { setStartDate(''); setEndDate(''); setStatus(''); setPage(1); }}
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              Limpiar filtros
            </button>

            {/* Resumen rápido */}
            <div className="ml-auto flex gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Total ventas página</p>
                <p className="text-base font-bold text-pink-600">{formatCurrency(totalAmount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Registros</p>
                <p className="text-base font-bold text-gray-700">{total}</p>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <LoadingSpinner message="Cargando ventas..." />
              </div>
            ) : sales.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                No hay ventas en el período seleccionado
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="text-left px-5 py-3">Orden SAP</th>
                    <th className="text-left px-5 py-3">Fecha</th>
                    <th className="text-right px-5 py-3">Monto</th>
                    <th className="text-center px-5 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sales.map((sale) => {
                    const st = statusLabel[sale.status] || { label: sale.status, color: '' };
                    return (
                      <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-gray-600 text-xs">{sale.sapOrderId}</td>
                        <td className="px-5 py-3 text-gray-600">{formatDate(sale.saleDate)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatCurrency(sale.amount)}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Anterior
              </button>
              <span className="text-sm text-gray-600">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
