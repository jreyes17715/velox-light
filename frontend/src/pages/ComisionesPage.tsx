import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout/Layout';
import api from '../utils/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TipoAResult {
  compraBruta: number;
  compraNeta: number;
  rate: number;
  comision: number;
  consultoras: { name: string; sapUserId: string; ventas: number }[];
}

interface TipoBUnit {
  unitName: string;
  directoraName: string;
  directoraSapUserId: string;
  compraBruta: number;
  compraNeta: number;
  comision: number;
}

interface TipoBResult {
  rate: number;
  totalComision: number;
  descendantCount: number;
  unidades: TipoBUnit[];
}

interface TipoCRecluta {
  name: string;
  sapUserId: string;
  compraBruta: number;
  compraNeta: number;
  activa: boolean;
}

interface TipoCResult {
  rate: number;
  totalComision: number;
  totalReclutas: number;
  reclutasActivas: number;
  reclutas: TipoCRecluta[];
}

interface CommissionResult {
  userId: string;
  month: number;
  year: number;
  tipoA: TipoAResult;
  tipoB: TipoBResult;
  tipoC: TipoCResult;
  totalComision: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(n);
}

function pct(rate: number) {
  return `${(rate * 100).toFixed(0)}%`;
}

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function CommCard({ label, comision, rate, detail }: {
  label: string; comision: number; rate: number; detail: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{fmt(comision)}</p>
      <p className="text-sm text-gray-500">{detail} · tasa {pct(rate)}</p>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ComisionesPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [data, setData]   = useState<CommissionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<'A' | 'B' | 'C' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<CommissionResult>('/commissions', { params: { month, year } });
      setData(res.data);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Error cargando comisiones');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <Layout>
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Comisiones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cálculo basado en ventas SAP del período seleccionado</p>
        </div>

        {/* Selector mes/año */}
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
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

      {/* Estado */}
      {loading && (
        <div className="text-center py-16 text-gray-400">Calculando comisiones…</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Total */}
          <div className="bg-gradient-to-r from-pink-500 to-pink-700 rounded-xl p-6 text-white">
            <p className="text-sm font-semibold opacity-80 uppercase tracking-wide">Total Comisiones</p>
            <p className="text-4xl font-bold mt-1">{fmt(data.totalComision)}</p>
            <p className="text-sm opacity-70 mt-1">{MONTHS[data.month - 1]} {data.year}</p>
          </div>

          {/* Cards de los 3 tipos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CommCard
              label="A · Producción de Unidad"
              comision={data.tipoA.comision}
              rate={data.tipoA.rate}
              detail={`Neta ${fmt(data.tipoA.compraNeta)}`}
            />
            <CommCard
              label="B · Unidades Descendientes"
              comision={data.tipoB.totalComision}
              rate={data.tipoB.rate}
              detail={`${data.tipoB.descendantCount} unidad(es)`}
            />
            <CommCard
              label="C · Asociadas Personales"
              comision={data.tipoC.totalComision}
              rate={data.tipoC.rate}
              detail={`${data.tipoC.reclutasActivas} activas de ${data.tipoC.totalReclutas}`}
            />
          </div>

          {/* Detalle Tipo A */}
          {data.tipoA.consultoras.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenSection(openSection === 'A' ? null : 'A')}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-800">
                  Detalle Tipo A — {data.tipoA.consultoras.length} miembro(s)
                </span>
                <span className="text-gray-400 text-lg">{openSection === 'A' ? '▲' : '▼'}</span>
              </button>
              {openSection === 'A' && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Nombre</th>
                        <th className="px-5 py-3 text-right">Venta Bruta</th>
                        <th className="px-5 py-3 text-right">Venta Neta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.tipoA.consultoras
                        .sort((a, b) => b.ventas - a.ventas)
                        .map(c => (
                          <tr key={c.sapUserId} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-900">{c.name}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{fmt(c.ventas)}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{fmt(c.ventas / 1.18)}</td>
                          </tr>
                        ))}
                      <tr className="bg-pink-50 font-semibold">
                        <td className="px-5 py-3 text-pink-800">Total</td>
                        <td className="px-5 py-3 text-right text-pink-800">{fmt(data.tipoA.compraBruta)}</td>
                        <td className="px-5 py-3 text-right text-pink-800">{fmt(data.tipoA.compraNeta)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Detalle Tipo B */}
          {data.tipoB.unidades.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenSection(openSection === 'B' ? null : 'B')}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-800">
                  Detalle Tipo B — {data.tipoB.unidades.length} unidad(es) descendiente(s)
                </span>
                <span className="text-gray-400 text-lg">{openSection === 'B' ? '▲' : '▼'}</span>
              </button>
              {openSection === 'B' && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Unidad</th>
                        <th className="px-5 py-3 text-left">Directora</th>
                        <th className="px-5 py-3 text-right">Neta</th>
                        <th className="px-5 py-3 text-right">Comisión ({pct(data.tipoB.rate)})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.tipoB.unidades
                        .sort((a, b) => b.comision - a.comision)
                        .map(u => (
                          <tr key={u.directoraSapUserId} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-900 font-medium">{u.unitName}</td>
                            <td className="px-5 py-3 text-gray-600">{u.directoraName}</td>
                            <td className="px-5 py-3 text-right text-gray-700">{fmt(u.compraNeta)}</td>
                            <td className="px-5 py-3 text-right text-pink-700 font-semibold">{fmt(u.comision)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Detalle Tipo C */}
          {data.tipoC.reclutas.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setOpenSection(openSection === 'C' ? null : 'C')}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-800">
                  Detalle Tipo C — {data.tipoC.reclutasActivas} activas / {data.tipoC.totalReclutas} reclutas
                </span>
                <span className="text-gray-400 text-lg">{openSection === 'C' ? '▲' : '▼'}</span>
              </button>
              {openSection === 'C' && (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 text-left">Nombre</th>
                        <th className="px-5 py-3 text-center">Estado</th>
                        <th className="px-5 py-3 text-right">Neta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.tipoC.reclutas
                        .sort((a, b) => b.compraBruta - a.compraBruta)
                        .map(r => (
                          <tr key={r.sapUserId} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-900">{r.name}</td>
                            <td className="px-5 py-3 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                r.activa
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                {r.activa ? 'Activa' : 'Inactiva'}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-gray-700">{fmt(r.compraNeta)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Sin datos */}
          {data.totalComision === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Sin comisiones para {MONTHS[data.month - 1]} {data.year}</p>
              <p className="text-sm mt-1">No hay ventas registradas en este período</p>
            </div>
          )}
        </>
      )}
    </div>
    </Layout>
  );
}
