import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout/Layout';
import api from '../utils/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UnidadRow {
  directoraId: string;
  sapUserId: string;
  nombre: string;
  unidad: string;
  miembros: number;
  compraBruta: number;
  compraNeta: number;
  rate: number;
  comision: number;
  pedidos: number;
}

interface Resumen {
  totalBruta: number;
  totalNeta: number;
  totalComision: number;
  totalPedidos: number;
  unidadesCount: number;
}

interface OverviewResponse {
  month: number;
  year: number;
  resumen: Resumen;
  unidades: UnidadRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(0)}%`;
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ─── Página ───────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [data, setData]   = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<OverviewResponse>('/superadmin/overview', { params: { month, year } });
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin — Vista Global</h1>
            <p className="text-sm text-gray-500 mt-0.5">Producción consolidada de todas las unidades</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            >
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Cargando datos…</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

        {data && !loading && (
          <>
            {/* Cards resumen global */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-pink-500 to-pink-700 rounded-xl p-5 text-white col-span-2 sm:col-span-1">
                <p className="text-xs font-semibold opacity-80 uppercase tracking-wide">Producción Bruta</p>
                <p className="text-2xl font-bold mt-1">{fmt(data.resumen.totalBruta)}</p>
                <p className="text-xs opacity-70 mt-1">{MONTHS[data.month - 1]} {data.year}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Producción Neta</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(data.resumen.totalNeta)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Comisiones</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(data.resumen.totalComision)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidades Activas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {data.unidades.filter(u => u.compraBruta > 0).length}
                  <span className="text-sm font-normal text-gray-400"> / {data.resumen.unidadesCount}</span>
                </p>
              </div>
            </div>

            {/* Ranking de unidades */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Ranking de Unidades — {MONTHS[data.month - 1]} {data.year}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-center w-10">#</th>
                      <th className="px-4 py-3 text-left">Unidad</th>
                      <th className="px-4 py-3 text-left">Directora</th>
                      <th className="px-4 py-3 text-right">Miembros</th>
                      <th className="px-4 py-3 text-right">Bruta</th>
                      <th className="px-4 py-3 text-right">Neta</th>
                      <th className="px-4 py-3 text-center">Tasa</th>
                      <th className="px-4 py-3 text-right">Comisión A</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.unidades.map((u, i) => (
                      <tr key={u.sapUserId} className={`hover:bg-gray-50 ${u.compraBruta === 0 ? 'opacity-40' : ''}`}>
                        <td className="px-4 py-3 text-center">
                          {i === 0 && <span className="text-yellow-500 font-bold">🥇</span>}
                          {i === 1 && <span className="text-gray-400 font-bold">🥈</span>}
                          {i === 2 && <span className="text-amber-600 font-bold">🥉</span>}
                          {i > 2 && <span className="text-gray-400 text-xs">{i + 1}</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{u.unidad}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{u.nombre}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{u.miembros}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(u.compraBruta)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(u.compraNeta)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            u.rate >= 0.14 ? 'bg-purple-100 text-purple-700' :
                            u.rate >= 0.08 ? 'bg-green-100 text-green-700' :
                            u.rate >= 0.06 ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-400'
                          }`}>
                            {u.rate > 0 ? pct(u.rate) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-pink-700">{u.comision > 0 ? fmt(u.comision) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-pink-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 font-bold text-pink-800">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmt(data.resumen.totalBruta)}</td>
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmt(data.resumen.totalNeta)}</td>
                      <td />
                      <td className="px-4 py-3 text-right font-bold text-pink-800">{fmt(data.resumen.totalComision)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
