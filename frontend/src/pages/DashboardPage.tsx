import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid, PieChart, Pie,
} from 'recharts';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OverviewData {
  user:            { name: string; role: string; unitName: string | null };
  // personales
  totalSales:      number;
  todaySales:      number;
  yesterdaySales:  number;
  lastMonthSales:  number;
  todayCount:      number;
  salesCount:      number;
  targetAmount:    number;
  achievementPercent: number;
  // grupo
  groupTotalSales:      number;
  lastMonthGroupSales:  number;
  groupTargetAmount:    number;
  groupAchievementPercent: number;
  consultorasActivas:          number;
  lastMonthConsultorasActivas: number;
  subordinateCount: number;
  consultoraRanking: { sapUserId: string; name: string; ventas: number; meta: number; pedidos: number }[];
  period: { month: number; year: number };
}

interface SubordinateData {
  id: string; name: string; sapUserId: string;
  totalSales: number; targetAmount: number; achievementPercent: number; salesCount: number;
}
interface Sale { saleDate: string; amount: number; status: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS       = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
// MONTHS_SHORT reserved for future use;

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}
function deltaPct(current: number, prev: number): number {
  if (!prev) return 0;
  return ((current - prev) / prev) * 100;
}

const I = ({ icon, className = '' }: { icon: string; className?: string }) => (
  <i className={`${icon} fa-fw ${className}`} aria-hidden="true" />
);

// ─── KPI Card (mismo estilo SuperAdmin) ───────────────────────────────────────

function KpiCard({ icon, iconBg, iconColor, label, value, compareLabel, delta }: {
  icon: string; iconBg: string; iconColor: string;
  label: string; value: string;
  compareLabel: string; delta: number;
}) {
  const positive = delta >= 0;
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <I icon={icon} className={`text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs text-gray-400">{compareLabel}</span>
          <span className={`text-xs font-semibold flex items-center gap-0.5 ${positive ? 'text-green-600' : 'text-red-500'}`}>
            <I icon={positive ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'} className="text-[10px]" />
            {Math.abs(delta).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Gauge Avance de Meta ─────────────────────────────────────────────────────

function AvanceGauge({ produccion, meta, label = 'Avance de Meta' }: { produccion: number; meta: number; label?: string }) {
  const avance   = meta > 0 ? Math.min((produccion / meta) * 100, 100) : 0;
  const faltante = meta > produccion ? meta - produccion : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
      <div className="flex flex-col items-center">
        <div className="relative w-40 h-20 overflow-hidden">
          <PieChart width={160} height={160} style={{ marginTop: -80 }}>
            <Pie
              data={[{ value: avance }, { value: 100 - avance }]}
              cx={80} cy={130} startAngle={180} endAngle={0}
              innerRadius={55} outerRadius={75} dataKey="value" strokeWidth={0}
            >
              <Cell fill={avance >= 100 ? '#16a34a' : avance >= 70 ? '#ec4899' : '#f97316'} />
              <Cell fill="#f3f4f6" />
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex items-end justify-center pb-1">
            <p className="text-2xl font-bold text-gray-900">{avance.toFixed(1)}%</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Cumplimiento</p>
        <p className="text-xs text-gray-500 mt-2 text-center">{fmt(produccion)} / {meta > 0 ? fmt(meta) : 'Sin meta'}</p>
        {faltante > 0 && (
          <div className="mt-3 w-full bg-red-50 rounded-lg px-3 py-2 flex justify-between">
            <span className="text-xs text-red-600">Faltante:</span>
            <span className="text-xs font-bold text-red-700">{fmt(faltante)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ranking Top Consultoras ──────────────────────────────────────────────────

function RankingConsultoras({ personas }: { personas: OverviewData['consultoraRanking'] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Consultoras del Mes</p>
      <div className="space-y-3">
        {personas.map((p, i) => (
          <div key={p.sapUserId} className="flex items-center gap-3">
            <div className="w-6 text-center flex-shrink-0">
              {i < 3
                ? <I icon="fa-solid fa-circle" className={`text-xs ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-amber-600'}`} />
                : <span className="text-xs text-gray-400">{i + 1}</span>}
            </div>
            <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-pink-600 text-xs font-bold">{p.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
              {p.meta > 0 && (
                <div className="w-full h-1 bg-gray-100 rounded-full mt-0.5">
                  <div
                    className="h-full bg-pink-400 rounded-full"
                    style={{ width: `${Math.min((p.ventas / p.meta) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <p className="text-xs font-bold text-pink-700">{fmt(p.ventas)}</p>
          </div>
        ))}
        {personas.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Sin datos este mes</p>
        )}
      </div>
    </div>
  );
}

// ─── Produccion por Consultora ────────────────────────────────────────────────

function ProduccionPorConsultora({ subordinates }: { subordinates: SubordinateData[] }) {
  const sorted = [...subordinates].sort((a, b) => b.totalSales - a.totalSales).slice(0, 10);
  const data   = sorted.map(s => ({
    name:   s.name.split(' ')[0],
    ventas: s.totalSales,
    meta:   s.targetAmount,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Produccion por Consultora</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="ventas" radius={[0, 4, 4, 0]} barSize={14}>
            {data.map((_, i) => <Cell key={i} fill={i === 0 ? '#ec4899' : i === 1 ? '#f472b6' : '#fbcfe8'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Grafico de linea (ventas diarias) ───────────────────────────────────────

function SalesLineChart({ data }: { data: { date: string; amount: number }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Ventas Personales - Ultimos 30 dias</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9ca3af' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} interval={6} />
          <YAxis hide />
          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} labelFormatter={l => `Fecha: ${l}`} />
          <Line type="monotone" dataKey="amount" stroke="#ec4899" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Termometro ───────────────────────────────────────────────────────────────

function Termometro({ produccion, meta, month, year, label }: { produccion: number; meta: number; month: number; year: number; label: string }) {
  const avance   = meta > 0 ? Math.min((produccion / meta) * 100, 100) : 0;
  const faltante = meta > produccion ? meta - produccion : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label} ({MONTHS[month - 1]} {year})</p>
      <div className="flex gap-4 items-end">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="relative w-5 bg-gray-100 rounded-full overflow-hidden" style={{ height: 120 }}>
            <div className="absolute bottom-0 w-full bg-pink-500 rounded-full transition-all duration-700" style={{ height: `${avance}%` }} />
          </div>
          <div className="w-5 h-5 bg-pink-500 rounded-full border-2 border-pink-300" />
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <div className="bg-pink-50 rounded-lg p-2.5">
            <p className="text-xs text-pink-600 font-semibold">Meta</p>
            <p className="text-base font-bold text-pink-800">{meta > 0 ? fmt(meta) : 'Sin meta'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500 font-semibold">Producido</p>
            <p className="text-base font-bold text-gray-800">{fmt(produccion)}</p>
            <p className="text-lg font-black text-pink-600 mt-0.5">{avance.toFixed(1)}%</p>
          </div>
          {faltante > 0 && (
            <div className="bg-red-50 rounded-lg p-2 flex justify-between">
              <span className="text-xs text-red-600">Faltante:</span>
              <span className="text-xs font-bold text-red-700">{fmt(faltante)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tabla de Consultoras ─────────────────────────────────────────────────────

function TablaConsultoras({ subordinates }: { subordinates: SubordinateData[] }) {
  const sorted = [...subordinates].sort((a, b) => b.totalSales - a.totalSales);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="font-semibold text-gray-800 text-sm">
          <I icon="fa-solid fa-users" className="mr-2 text-pink-500" />
          Mis Consultoras ({subordinates.length})
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-center w-8">#</th>
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-right">Ventas</th>
              <th className="px-4 py-3 text-right">Pedidos</th>
              <th className="px-4 py-3 text-right">Meta</th>
              <th className="px-4 py-3 text-center">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((s, i) => (
              <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${s.totalSales === 0 ? 'opacity-40' : ''}`}>
                <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-pink-600 text-xs font-bold">{s.name.charAt(0)}</span>
                    </div>
                    <span className="font-medium text-gray-800">{s.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-800">{s.totalSales > 0 ? fmt(s.totalSales) : '-'}</td>
                <td className="px-4 py-3 text-right text-gray-500">{s.salesCount}</td>
                <td className="px-4 py-3 text-right text-gray-500">{s.targetAmount > 0 ? fmt(s.targetAmount) : '-'}</td>
                <td className="px-4 py-3 text-center">
                  {s.targetAmount > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                        <div
                          className={`h-full rounded-full ${s.achievementPercent >= 100 ? 'bg-green-500' : s.achievementPercent >= 70 ? 'bg-pink-400' : 'bg-orange-400'}`}
                          style={{ width: `${Math.min(s.achievementPercent, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold w-10 text-right ${s.achievementPercent >= 100 ? 'text-green-600' : s.achievementPercent >= 70 ? 'text-pink-600' : 'text-orange-500'}`}>
                        {s.achievementPercent.toFixed(0)}%
                      </span>
                    </div>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dashboard Consultora ─────────────────────────────────────────────────────
// Layout simple para roles sin subordinadas

function ConsultoraDashboard() {
  const now   = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, salesRes] = await Promise.all([
        api.get<OverviewData>('/dashboard/overview', { params: { month, year } }),
        api.get<{ data: Sale[] }>('/sales', { params: { limit: 200 } }),
      ]);
      setOverview(ov.data);

      const byDate: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        byDate[d.toISOString().slice(0, 10)] = 0;
      }
      salesRes.data.data.forEach(s => {
        const k = s.saleDate.slice(0, 10);
        if (k in byDate) byDate[k] += s.amount;
      });
      setChartData(Object.entries(byDate).map(([date, amount]) => ({ date, amount })));
    } catch { setError('Error cargando datos.'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);
  const ov    = overview;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mi Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">{ov?.user.name} &middot; {MONTHS[month - 1]} {year}</p>
          </div>
          <div className="flex gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading && <LoadingSpinner message="Cargando..." />}
        {error && <ErrorAlert message={error} />}

        {ov && !loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon="fa-solid fa-bolt" iconBg="bg-yellow-100" iconColor="text-yellow-600"
                label="Ventas del Dia" value={fmt(ov.todaySales)}
                compareLabel="vs. ayer" delta={deltaPct(ov.todaySales, ov.yesterdaySales)} />
              <KpiCard icon="fa-solid fa-bag-shopping" iconBg="bg-pink-100" iconColor="text-pink-600"
                label="Ventas del Mes" value={fmt(ov.totalSales)}
                compareLabel="vs. mes anterior" delta={deltaPct(ov.totalSales, ov.lastMonthSales)} />
              <KpiCard icon="fa-solid fa-bullseye" iconBg="bg-purple-100" iconColor="text-purple-600"
                label="% Cumplimiento" value={`${ov.achievementPercent.toFixed(1)}%`}
                compareLabel="meta:" delta={ov.achievementPercent - 100} />
              <KpiCard icon="fa-solid fa-box" iconBg="bg-blue-100" iconColor="text-blue-600"
                label="Pedidos del Mes" value={String(ov.salesCount)}
                compareLabel="pedidos hoy:" delta={deltaPct(ov.todayCount, 0)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2"><SalesLineChart data={chartData} /></div>
              <AvanceGauge produccion={ov.totalSales} meta={ov.targetAmount} label="Mi Avance de Meta" />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ─── Dashboard Directora ──────────────────────────────────────────────────────

function DirectoraDashboard() {
  const now   = new Date();
  const [month, setMonth]           = useState(now.getMonth() + 1);
  const [year, setYear]             = useState(now.getFullYear());
  const [overview, setOverview]     = useState<OverviewData | null>(null);
  const [subordinates, setSubords]  = useState<SubordinateData[]>([]);
  const [chartData, setChartData]   = useState<{ date: string; amount: number }[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [tab, setTab]               = useState<'grupo' | 'personal'>('grupo');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, subsRes, salesRes] = await Promise.all([
        api.get<OverviewData>('/dashboard/overview', { params: { month, year } }),
        api.get<{ data: SubordinateData[] }>('/dashboard/subordinates', { params: { month, year, limit: 100 } }),
        api.get<{ data: Sale[] }>('/sales', { params: { limit: 200 } }),
      ]);
      setOverview(ov.data);
      setSubords(subsRes.data.data);

      const byDate: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        byDate[d.toISOString().slice(0, 10)] = 0;
      }
      salesRes.data.data.forEach(s => {
        const k = s.saleDate.slice(0, 10);
        if (k in byDate) byDate[k] += s.amount;
      });
      setChartData(Object.entries(byDate).map(([date, amount]) => ({ date, amount })));
    } catch { setError('Error cargando datos.'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);
  const ov = overview;

  const TABS = [
    { key: 'grupo'    as const, icon: 'fa-solid fa-users',         label: 'Vista Grupo'    },
    { key: 'personal' as const, icon: 'fa-solid fa-circle-user',   label: 'Mis Ventas'     },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              <I icon="fa-solid fa-star" className="text-pink-500 mr-2" />
              {ov?.user.unitName ?? 'Mi Unidad'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Directora: {ov?.user.name} &middot; {MONTHS[month - 1]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {loading && <LoadingSpinner message="Cargando dashboard..." />}
        {error && <ErrorAlert message={error} />}

        {ov && !loading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon="fa-solid fa-bolt" iconBg="bg-yellow-100" iconColor="text-yellow-600"
                label="Ventas del Dia" value={fmt(ov.todaySales)}
                compareLabel="vs. ayer" delta={deltaPct(ov.todaySales, ov.yesterdaySales)} />
              <KpiCard icon="fa-solid fa-bag-shopping" iconBg="bg-pink-100" iconColor="text-pink-600"
                label="Ventas del Mes (Grupo)" value={fmt(ov.groupTotalSales)}
                compareLabel="vs. mes anterior" delta={deltaPct(ov.groupTotalSales, ov.lastMonthGroupSales)} />
              <KpiCard icon="fa-solid fa-user-group" iconBg="bg-blue-100" iconColor="text-blue-600"
                label="Consultoras Activas" value={`${ov.consultorasActivas} / ${ov.subordinateCount}`}
                compareLabel="vs. mes anterior" delta={deltaPct(ov.consultorasActivas, ov.lastMonthConsultorasActivas)} />
              <KpiCard icon="fa-solid fa-bullseye" iconBg="bg-purple-100" iconColor="text-purple-600"
                label="Avance Grupo" value={`${ov.groupAchievementPercent.toFixed(1)}%`}
                compareLabel="meta grupo:" delta={ov.groupAchievementPercent - 100} />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-700'}`}>
                  <I icon={t.icon} className="text-xs" />{t.label}
                </button>
              ))}
            </div>

            {/* Vista Grupo */}
            {tab === 'grupo' && (
              <>
                {/* Grid central: barras + gauge + ranking */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <ProduccionPorConsultora subordinates={subordinates} />
                  </div>
                  <AvanceGauge produccion={ov.groupTotalSales} meta={ov.groupTargetAmount} label="Avance General Grupo" />
                  <RankingConsultoras personas={ov.consultoraRanking} />
                </div>

                {/* Termometro + resumen */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <Termometro produccion={ov.groupTotalSales} meta={ov.groupTargetAmount} month={month} year={year} label="Termometro de Grupo" />
                  <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Resumen del Grupo - {MONTHS[month - 1]} {year}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {[
                        { label: 'Produccion Grupo', value: fmt(ov.groupTotalSales), color: 'text-pink-700' },
                        { label: 'Meta del Grupo',   value: ov.groupTargetAmount > 0 ? fmt(ov.groupTargetAmount) : 'Sin meta', color: 'text-gray-900' },
                        { label: 'Total Consultoras',value: String(ov.subordinateCount), color: 'text-gray-900' },
                        { label: 'Pedidos del Grupo',value: subordinates.reduce((s, c) => s + c.salesCount, 0).toLocaleString(), color: 'text-gray-900' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                          <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tabla completa */}
                <TablaConsultoras subordinates={subordinates} />
              </>
            )}

            {/* Vista Personal */}
            {tab === 'personal' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard icon="fa-solid fa-bolt" iconBg="bg-yellow-100" iconColor="text-yellow-600"
                    label="Mis Ventas Hoy" value={fmt(ov.todaySales)}
                    compareLabel="vs. ayer" delta={deltaPct(ov.todaySales, ov.yesterdaySales)} />
                  <KpiCard icon="fa-solid fa-bag-shopping" iconBg="bg-pink-100" iconColor="text-pink-600"
                    label="Mis Ventas del Mes" value={fmt(ov.totalSales)}
                    compareLabel="vs. mes anterior" delta={deltaPct(ov.totalSales, ov.lastMonthSales)} />
                  <KpiCard icon="fa-solid fa-bullseye" iconBg="bg-purple-100" iconColor="text-purple-600"
                    label="Mi Cumplimiento" value={`${ov.achievementPercent.toFixed(1)}%`}
                    compareLabel="meta personal:" delta={ov.achievementPercent - 100} />
                  <KpiCard icon="fa-solid fa-box" iconBg="bg-blue-100" iconColor="text-blue-600"
                    label="Mis Pedidos" value={String(ov.salesCount)}
                    compareLabel="pedidos hoy:" delta={deltaPct(ov.todayCount, 0)} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2"><SalesLineChart data={chartData} /></div>
                  <AvanceGauge produccion={ov.totalSales} meta={ov.targetAmount} label="Mi Avance Personal" />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

// ─── Dashboard Superadmin ─────────────────────────────────────────────────────
// (Redirige al SuperAdminPage existente)

// ─── Entry point ──────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    if (user.isSuperAdmin) navigate('/superadmin', { replace: true });
  }, [user]);

  if (!user) return <LoadingSpinner message="Cargando..." />;
  if (user.isSuperAdmin) return null; // se redirige arriba

  const role = user.role;
  if (role === 'directora' || role === 'diq' || role === 'iniciadora') return <DirectoraDashboard />;
  return <ConsultoraDashboard />;
}
