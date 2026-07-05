import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { Sale, PaginatedResponse } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';

// ─── Tipos reporte SuperAdmin ─────────────────────────────────────────────────

interface PersonaRow {
  sapUserId: string; nombre: string; rol: string;
  unidad: string; directora: string;
  totalBruta: number; totalNeta: number; pedidos: number; promedio: number;
}
interface UnidadRow {
  unidad: string; directora: string; miembros: number;
  totalBruta: number; totalNeta: number; pedidos: number; rate: number; comision: number;
}
interface ReportResponse {
  startDate: string; endDate: string; totalRegistros: number;
  porPersona: PersonaRow[]; porUnidad: UnidadRow[];
}
interface UnidadOption { id: string; nombre: string; unidad: string; }

function fmtDOP(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

// ─── Vista Ventas SuperAdmin ──────────────────────────────────────────────────

function SuperAdminSalesView() {
  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const defaultEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(defaultEnd);
  const [unitId,    setUnitId]    = useState('');
  const [tab,       setTab]       = useState<'persona' | 'unidad'>('persona');
  const [data,      setData]      = useState<ReportResponse | null>(null);
  const [unidades,  setUnidades]  = useState<UnidadOption[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Cargar lista de unidades para el filtro
  useEffect(() => {
    api.get<{ unidades: { directoraId: string; nombre: string; unidad: string }[] }>(
      '/superadmin/overview', { params: { month: now.getMonth() + 1, year: now.getFullYear() } }
    ).then(r => setUnidades(r.data.unidades.map(u => ({ id: u.directoraId, nombre: u.nombre, unidad: u.unidad }))));
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<ReportResponse>('/superadmin/sales-report', {
        params: { startDate, endDate, ...(unitId ? { unitId } : {}) },
      });
      setData(r.data);
    } catch {
      setError('Error cargando el reporte.');
    } finally { setLoading(false); }
  }, [startDate, endDate, unitId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ─── Export a Excel ───────────────────────────────────────────────────────

  const exportPersona = () => {
    if (!data) return;
    const rows = data.porPersona.map((r, i) => ({
      '#':            i + 1,
      'Código SAP':   r.sapUserId,
      'Nombre':       r.nombre,
      'Rol':          r.rol,
      'Unidad':       r.unidad,
      'Directora':    r.directora,
      'Venta Bruta':  r.totalBruta,
      'Venta Neta':   parseFloat(r.totalNeta.toFixed(2)),
      'Pedidos':      r.pedidos,
      'Promedio/Pedido': parseFloat(r.promedio.toFixed(2)),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 4 },{ wch: 12 },{ wch: 28 },{ wch: 12 },{ wch: 22 },{ wch: 22 },{ wch: 16 },{ wch: 14 },{ wch: 9 },{ wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Por Persona');
    XLSX.writeFile(wb, `ventas_por_persona_${startDate}_${endDate}.xlsx`);
  };

  const exportUnidad = () => {
    if (!data) return;
    const rows = data.porUnidad.map((r, i) => ({
      '#':            i + 1,
      'Unidad':       r.unidad,
      'Directora':    r.directora,
      'Miembros':     r.miembros,
      'Venta Bruta':  r.totalBruta,
      'Venta Neta':   parseFloat(r.totalNeta.toFixed(2)),
      'Pedidos':      r.pedidos,
      'Tasa Comisión': `${(r.rate * 100).toFixed(0)}%`,
      'Comisión Est.': parseFloat(r.comision.toFixed(2)),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 4 },{ wch: 22 },{ wch: 22 },{ wch: 9 },{ wch: 16 },{ wch: 14 },{ wch: 9 },{ wch: 14 },{ wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Por Unidad');
    XLSX.writeFile(wb, `ventas_por_unidad_${startDate}_${endDate}.xlsx`);
  };

  const totalBruta = data?.porPersona.reduce((s, r) => s + r.totalBruta, 0) ?? 0;
  const totalPedidos = data?.porPersona.reduce((s, r) => s + r.pedidos, 0) ?? 0;

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-800">Ventas y Producción</h2>
          <p className="text-xs text-gray-500">Reporte global — exportable a Excel</p>
        </div>

        <div className="flex-1 p-6 space-y-4 max-w-7xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unidad</label>
              <select value={unitId} onChange={e => setUnitId(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                <option value="">Todas las unidades</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.unidad}</option>)}
              </select>
            </div>
            <button onClick={() => { setStartDate(defaultStart); setEndDate(defaultEnd); setUnitId(''); }}
              className="text-sm text-gray-400 hover:text-gray-600 underline self-end pb-2">
              Limpiar
            </button>

            {/* Totales rápidos */}
            {data && (
              <div className="ml-auto flex gap-5 items-center">
                <div className="text-right">
                  <p className="text-xs text-gray-400">Producción Bruta</p>
                  <p className="text-lg font-bold text-pink-600">{fmtDOP(totalBruta)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Pedidos</p>
                  <p className="text-lg font-bold text-gray-700">{totalPedidos}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Personas</p>
                  <p className="text-lg font-bold text-gray-700">{data.totalRegistros}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tabs + Export */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {([['persona', '👤 Por Persona'], ['unidad', '🏢 Por Unidad']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={tab === 'persona' ? exportPersona : exportUnidad}
              disabled={!data || loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              <span>📥</span> Exportar a Excel
            </button>
          </div>

          {/* Tabla Por Persona */}
          {loading && <LoadingSpinner message="Cargando reporte..." />}

          {!loading && data && tab === 'persona' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {data.porPersona.length} personas · {data.startDate} → {data.endDate}
                </p>
                <p className="text-xs text-gray-400">Ordenado por venta bruta desc</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-center w-10">#</th>
                      <th className="px-4 py-3 text-left">Nombre</th>
                      <th className="px-4 py-3 text-left">Unidad</th>
                      <th className="px-4 py-3 text-center">Rol</th>
                      <th className="px-4 py-3 text-right">Venta Bruta</th>
                      <th className="px-4 py-3 text-right">Venta Neta</th>
                      <th className="px-4 py-3 text-right">Pedidos</th>
                      <th className="px-4 py-3 text-right">Promedio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.porPersona.map((r, i) => (
                      <tr key={r.sapUserId} className={`hover:bg-gray-50 ${r.totalBruta === 0 ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{r.nombre}</p>
                          <p className="text-xs text-gray-400">{r.sapUserId}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.unidad}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.rol === 'directora' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                            {r.rol}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{r.totalBruta > 0 ? fmtDOP(r.totalBruta) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.totalNeta > 0 ? fmtDOP(r.totalNeta) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.pedidos}</td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">{r.promedio > 0 ? fmtDOP(r.promedio) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-pink-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-bold text-pink-800 text-sm">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmtDOP(totalBruta)}</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmtDOP(totalBruta / 1.18)}</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{totalPedidos}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tabla Por Unidad */}
          {!loading && data && tab === 'unidad' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {data.porUnidad.length} unidades · {data.startDate} → {data.endDate}
                </p>
                <p className="text-xs text-gray-400">Ordenado por venta bruta desc</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-center w-10">#</th>
                      <th className="px-4 py-3 text-left">Unidad</th>
                      <th className="px-4 py-3 text-left">Directora</th>
                      <th className="px-4 py-3 text-right">Miembros</th>
                      <th className="px-4 py-3 text-right">Venta Bruta</th>
                      <th className="px-4 py-3 text-right">Venta Neta</th>
                      <th className="px-4 py-3 text-right">Pedidos</th>
                      <th className="px-4 py-3 text-center">Tasa</th>
                      <th className="px-4 py-3 text-right">Comisión Est.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.porUnidad.map((r, i) => (
                      <tr key={r.unidad} className={`hover:bg-gray-50 ${r.totalBruta === 0 ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3 text-center">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-gray-400">{i + 1}</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{r.unidad}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{r.directora}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.miembros}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">{r.totalBruta > 0 ? fmtDOP(r.totalBruta) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.totalNeta > 0 ? fmtDOP(r.totalNeta) : '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.pedidos}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            r.rate >= 0.14 ? 'bg-purple-100 text-purple-700' :
                            r.rate >= 0.08 ? 'bg-green-100 text-green-700' :
                            r.rate >= 0.06 ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-400'
                          }`}>{r.rate > 0 ? `${(r.rate * 100).toFixed(0)}%` : '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.comision > 0 ? fmtDOP(r.comision) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-pink-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-bold text-pink-800 text-sm">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmtDOP(data.porUnidad.reduce((s, r) => s + r.totalBruta, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmtDOP(data.porUnidad.reduce((s, r) => s + r.totalNeta, 0))}</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{data.porUnidad.reduce((s, r) => s + r.pedidos, 0)}</td>
                      <td />
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmtDOP(data.porUnidad.reduce((s, r) => s + r.comision, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

const statusLabel: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completada', color: 'text-green-700 bg-green-50' },
  pending: { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-50' },
  cancelled: { label: 'Cancelada', color: 'text-red-700 bg-red-50' },
};

export function SalesPage() {
  const { user } = useAuthStore();

  // SuperAdmin tiene su propia vista de reporte
  if (user?.isSuperAdmin) return <SuperAdminSalesView />;
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
