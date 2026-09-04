import { useEffect, useState } from 'react';
import api from '../../utils/api';
import { Sale, PaginatedResponse } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface SalesDetailModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  month?: number;
  year?: number;
}

const statusLabel: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completada', color: 'text-green-700 bg-green-50' },
  pending:   { label: 'Pendiente',  color: 'text-yellow-700 bg-yellow-50' },
  cancelled: { label: 'Cancelada',  color: 'text-red-700 bg-red-50' },
};

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function SalesDetailModal({ userId, isOpen, onClose, month, year }: SalesDetailModalProps) {
  const now = new Date();
  const m = month ?? (now.getMonth() + 1);
  const y = year  ?? now.getFullYear();

  const defaultStart = toDateInput(new Date(y, m - 1, 1));
  const defaultEnd   = toDateInput(new Date(y, m, 0));   // ultimo dia del mes

  const [sales,     setSales]     = useState<Sale[]>([]);
  const [total,     setTotal]     = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(defaultEnd);
  const [status,    setStatus]    = useState('');

  // Reset fechas cuando se abre el modal para un usuario diferente
  useEffect(() => {
    if (isOpen) {
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      setStatus('');
    }
  }, [isOpen, userId]);

  // Fetch cuando cambian los filtros (solo si ambas fechas estan completas o ambas vacias)
  useEffect(() => {
    if (!isOpen) return;
    const bothFilled  = startDate && endDate;
    const bothEmpty   = !startDate && !endDate;
    if (bothFilled || bothEmpty) {
      fetchSales();
    }
  }, [isOpen, userId, startDate, endDate, status]);

  const fetchSales = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ userId, limit: '100' });
      if (startDate) params.append('startDate', startDate);
      if (endDate)   params.append('endDate',   endDate);
      if (status)    params.append('status',    status);

      const { data } = await api.get<PaginatedResponse<Sale>>(`/sales?${params}`);
      setSales(data.data);
      setTotal(data.total);
    } catch {
      setSales([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Detalle de Compras</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">x</button>
        </div>

        {/* Filtros */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="completed">Completadas</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); setStatus(''); }}
            className="text-xs text-gray-400 hover:text-pink-600 underline ml-auto"
          >
            Ver todo
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">Cargando...</div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-1">
              <span>Sin compras en el periodo</span>
              <span className="text-xs">
                {startDate && endDate ? `${startDate} al ${endDate}` : 'ninguna encontrada'}
              </span>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-gray-500 text-xs uppercase">
                  <th className="text-left px-5 py-3">Orden</th>
                  <th className="text-left px-5 py-3">Fecha</th>
                  <th className="text-right px-5 py-3">Monto</th>
                  <th className="text-center px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.map(sale => {
                  const st = statusLabel[sale.status] || { label: sale.status, color: '' };
                  return (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-mono text-gray-700">
                        {sale.sapOrderId}
                        {sale.isManualInvoice && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-700 font-sans">
                            Factura manual
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{formatDate(sale.saleDate)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(sale.amount)}</td>
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

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{total} compras encontradas</span>
          {sales.length > 0 && (
            <span className="font-semibold text-gray-700">
              Total: {sales.reduce((s, v) => s + v.amount, 0).toLocaleString('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
