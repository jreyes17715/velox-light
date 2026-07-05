import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import api from '../utils/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnidadRow {
  directoraId: string; sapUserId: string; nombre: string; unidad: string;
  miembros: number; compraBruta: number; compraNeta: number; rate: number;
  comision: number; pedidos: number;
}
interface Resumen {
  totalBruta: number; totalNeta: number; totalComision: number;
  totalPedidos: number; unidadesCount: number;
  todaySales: number; yesterdaySales: number; lastMonthBruta: number;
  consultorasActivas: number; lastMonthConsultorasActivas: number;
  unidadesActivas: number; lastMonthUnidadesActivas: number;
  totalMetas: number;
}
interface RankingPersona { sapUserId: string; name: string; role: string; ventas: number; }
interface OverviewResponse { month: number; year: number; resumen: Resumen; unidades: UnidadRow[]; rankingPersonas: RankingPersona[]; }

interface SearchResult {
  id: string; sapUserId: string; name: string; role: string; unitName: string | null;
  supervisor: { name: string; unitName: string | null } | null;
}
interface UserDetail {
  user: {
    id: string; sapUserId: string; name: string; email: string | null;
    role: string; unitName: string | null;
    supervisor: { name: string; sapUserId: string; unitName: string | null } | null;
    subordinadasCount: number; reclutasCount: number;
    reclutas: { name: string; sapUserId: string; role: string }[];
  };
  mesActual: { month: number; year: number; ventas: number; pedidos: number; meta: number };
  historial: { month: number; year: number; ventas: number; pedidos: number }[];
  ultimasVentas: { sapDocNum: number | null; amount: string; saleDate: string; status: string }[];
}
interface UnitDetail {
  directora: { id: string; sapUserId: string; name: string; unidad: string };
  month: number; year: number; totalBruta: number; totalNeta: number;
  miembros: { sapUserId: string; name: string; esDirectora: boolean; ventas: number; pedidos: number; meta: number; pct: number }[];
}
interface MetaMiembro { id: string; sapUserId: string; name: string; role: string; meta: number; }
interface MetaGrupo {
  directoraId: string; directoraSapId: string; directoraNombre: string;
  unidad: string; directoraMeta: number; miembros: MetaMiembro[];
}
interface MetasResponse { month: number; year: number; grupos: MetaGrupo[]; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}
function pct(rate: number) { return `${(rate * 100).toFixed(0)}%`; }
function deltaPct(current: number, prev: number): number {
  if (!prev) return 0;
  return ((current - prev) / prev) * 100;
}
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const I = ({ icon, className = '' }: { icon: string; className?: string }) => (
  <i className={`${icon} fa-fw ${className}`} aria-hidden="true" />
);

function Medal({ pos }: { pos: number }) {
  if (pos === 0) return <I icon="fa-solid fa-trophy" className="text-yellow-500" />;
  if (pos === 1) return <I icon="fa-solid fa-medal" className="text-gray-400" />;
  if (pos === 2) return <I icon="fa-solid fa-medal" className="text-amber-600" />;
  return <span className="text-xs text-gray-400">{pos + 1}</span>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

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

// ─── Avance General Gauge ────────────────────────────────────────────────────

function AvanceGauge({ produccion, meta }: { produccion: number; meta: number }) {
  const avance = meta > 0 ? Math.min((produccion / meta) * 100, 100) : 0;
  const faltante = meta > produccion ? meta - produccion : 0;

  // Semi-circle gauge via PieChart
  const filled = avance;
  const empty  = 100 - filled;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Avance General de Metas</p>
      <div className="flex flex-col items-center">
        <div className="relative w-40 h-20 overflow-hidden">
          <PieChart width={160} height={160} style={{ marginTop: -80 }}>
            <Pie
              data={[{ value: filled }, { value: empty }]}
              cx={80} cy={130}
              startAngle={180} endAngle={0}
              innerRadius={55} outerRadius={75}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="#ec4899" />
              <Cell fill="#f3f4f6" />
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex items-end justify-center pb-1">
            <p className="text-2xl font-bold text-gray-900">{avance.toFixed(2)}%</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Cumplimiento General</p>
        <p className="text-xs text-gray-500 mt-2">{fmt(produccion)} / {meta > 0 ? fmt(meta) : 'Sin meta'}</p>
        {faltante > 0 && (
          <div className="mt-3 w-full bg-red-50 rounded-lg px-3 py-2 flex justify-between">
            <span className="text-xs text-red-600">Faltante para la meta:</span>
            <span className="text-xs font-bold text-red-700">{fmt(faltante)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ranking Top 5 ───────────────────────────────────────────────────────────

function RankingTop5({ personas }: { personas: RankingPersona[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ranking de Personas (Produccion del Mes)</p>
      <div className="space-y-3">
        {personas.map((p, i) => (
          <div key={p.sapUserId} className="flex items-center gap-3">
            <div className="w-6 text-center flex-shrink-0">
              {i < 3
                ? <I icon="fa-solid fa-circle" className={`text-xs ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-400' : 'text-amber-600'}`} />
                : <span className="text-xs text-gray-400">{i + 1}</span>
              }
            </div>
            <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-pink-600 text-xs font-bold">{p.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{p.name}</p>
              <p className="text-xs text-gray-400 capitalize">{p.role}</p>
            </div>
            <p className="text-xs font-bold text-pink-700">{fmt(p.ventas)}</p>
          </div>
        ))}
        {personas.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Sin datos</p>}
      </div>
    </div>
  );
}

// ─── Produccion por Nivel ────────────────────────────────────────────────────

function ProduccionPorNivel({ unidades }: { unidades: UnidadRow[] }) {
  type Nivel = 'directoras' | 'unidades';
  const [nivel, setNivel] = useState<Nivel>('directoras');

  const dataDirectoras = [...unidades]
    .filter(u => u.compraBruta > 0)
    .slice(0, 8)
    .map(u => ({ name: u.nombre.split(' ')[0] + ' ' + (u.nombre.split(' ')[1] ?? ''), value: u.compraBruta }));

  const dataUnidades = [...unidades]
    .filter(u => u.compraBruta > 0)
    .slice(0, 8)
    .map(u => ({ name: u.unidad.length > 14 ? u.unidad.slice(0, 14) + '.' : u.unidad, value: u.compraBruta }));

  const chartData = nivel === 'directoras' ? dataDirectoras : dataUnidades;

  const TABS: { key: Nivel; label: string }[] = [
    { key: 'directoras', label: 'Directoras' },
    { key: 'unidades',   label: 'Unidades'   },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produccion por Nivel</p>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setNivel(t.key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${nivel === t.key ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
            {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#ec4899' : i === 1 ? '#f472b6' : '#fbcfe8'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Termometro Global ───────────────────────────────────────────────────────

function TermometroGlobal({ produccion, meta, month, year }: { produccion: number; meta: number; month: number; year: number }) {
  const avance = meta > 0 ? Math.min((produccion / meta) * 100, 100) : 0;
  const faltante = meta > produccion ? meta - produccion : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Termometro de Meta ({MONTHS[month - 1]} {year})</p>
      <div className="flex gap-4 items-end">
        {/* Termometro visual */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="relative w-5 bg-gray-100 rounded-full overflow-hidden" style={{ height: 140 }}>
            <div
              className="absolute bottom-0 w-full bg-pink-500 rounded-full transition-all duration-700"
              style={{ height: `${avance}%` }}
            />
          </div>
          <div className="w-5 h-5 bg-pink-500 rounded-full border-2 border-pink-300" />
        </div>
        {/* Datos */}
        <div className="flex-1 space-y-2 text-sm">
          <div className="bg-pink-50 rounded-lg p-2.5">
            <p className="text-xs text-pink-600 font-semibold">Meta del Mes</p>
            <p className="text-base font-bold text-pink-800">{meta > 0 ? fmt(meta) : 'Sin meta'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-500 font-semibold">Producido</p>
            <p className="text-base font-bold text-gray-800">{fmt(produccion)}</p>
            <p className="text-lg font-black text-pink-600 mt-0.5">{avance.toFixed(2)}%</p>
          </div>
          {faltante > 0 && (
            <div className="bg-red-50 rounded-lg p-2 flex justify-between items-center">
              <span className="text-xs text-red-600">Faltante:</span>
              <span className="text-xs font-bold text-red-700">{fmt(faltante)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel: Buscar Persona ────────────────────────────────────────────────────

function BuscarPersona({ month, year }: { month: number; year: number }) {
  const [q, setQ]               = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [loading, setLoading]   = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((val: string) => {
    if (val.length < 2) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await api.get<SearchResult[]>('/superadmin/search', { params: { q: val } });
      setResults(r.data);
    }, 300);
  }, []);

  const loadUser = async (sapUserId: string) => {
    setLoading(true); setResults([]); setQ('');
    try {
      const r = await api.get<UserDetail>(`/superadmin/user/${sapUserId}`, { params: { month, year } });
      setSelected(r.data);
    } finally { setLoading(false); }
  };

  if (loading) return <div className="text-center py-16 text-gray-400">Cargando perfil...</div>;

  return (
    <div className="space-y-5">
      <div className="relative">
        <input
          type="text" value={q}
          onChange={e => { setQ(e.target.value); search(e.target.value); if (!e.target.value) setSelected(null); }}
          placeholder="Buscar por nombre..."
          className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <I icon="fa-solid fa-magnifying-glass" className="absolute right-3 top-3.5 text-gray-400 text-sm" />
        {results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
            {results.map(r => (
              <button key={r.id} onClick={() => loadUser(r.sapUserId)}
                className="w-full text-left px-4 py-3 hover:bg-pink-50 flex items-center justify-between border-b last:border-0">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.sapUserId}{r.supervisor ? ` - ${r.supervisor.unitName ?? r.supervisor.name}` : ''}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.role === 'directora' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{r.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-14 h-14 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xl font-bold">{selected.user.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900">{selected.user.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selected.user.role === 'directora' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>{selected.user.role}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {selected.user.sapUserId}
                {selected.user.unitName ? ` - ${selected.user.unitName}` : ''}
                {selected.user.supervisor ? ` - Supervisora: ${selected.user.supervisor.name}` : ''}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><I icon="fa-solid fa-xmark" className="text-lg" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ventas del Mes', value: fmt(selected.mesActual.ventas) },
              { label: 'Pedidos', value: String(selected.mesActual.pedidos) },
              { label: 'Meta', value: selected.mesActual.meta > 0 ? fmt(selected.mesActual.meta) : '-' },
              { label: 'Cumplimiento', value: selected.mesActual.meta > 0 ? `${((selected.mesActual.ventas / selected.mesActual.meta) * 100).toFixed(1)}%` : '-' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Estructura</p>
              <div className="space-y-1 text-sm">
                {selected.user.supervisor && <div className="flex justify-between"><span className="text-gray-500">Supervisora</span><span className="font-medium">{selected.user.supervisor.name}</span></div>}
                <div className="flex justify-between"><span className="text-gray-500">Consultoras</span><span className="font-medium">{selected.user.subordinadasCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Reclutas</span><span className="font-medium">{selected.user.reclutasCount}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">Ultimas Ventas</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selected.ultimasVentas.length === 0 && <p className="text-xs text-gray-400">Sin ventas</p>}
                {selected.ultimasVentas.map((v, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-500">{new Date(v.saleDate).toLocaleDateString('es-DO')}</span>
                    <span className="font-medium text-gray-800">{fmt(Number(v.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">Historial 6 Meses</p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={selected.historial}>
                <XAxis dataKey={d => MONTHS_SHORT[d.month - 1]} tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="ventas" radius={[4,4,0,0]}>
                  {selected.historial.map((_, i) => <Cell key={i} fill={i === selected.historial.length - 1 ? '#ec4899' : '#f9a8d4'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!selected && q.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <I icon="fa-solid fa-magnifying-glass" className="text-5xl mb-3 block" />
          <p>Escribe el nombre de una consultora o directora</p>
        </div>
      )}
    </div>
  );
}

// ─── Panel: Ver Unidad ────────────────────────────────────────────────────────

function VerUnidad({ month, year, unidades }: { month: number; year: number; unidades: UnidadRow[] }) {
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail]         = useState<UnitDetail | null>(null);
  const [loading, setLoading]       = useState(false);

  const load = async (directoraId: string) => {
    if (!directoraId) { setDetail(null); return; }
    setLoading(true);
    try {
      const r = await api.get<UnitDetail>(`/superadmin/unit/${directoraId}`, { params: { month, year } });
      setDetail(r.data);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <select value={selectedId} onChange={e => { setSelectedId(e.target.value); load(e.target.value); }}
        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
        <option value="">Seleccionar unidad...</option>
        {unidades.map(u => <option key={u.directoraId} value={u.directoraId}>{u.unidad} - {u.nombre}</option>)}
      </select>
      {loading && <div className="text-center py-16 text-gray-400">Cargando unidad...</div>}
      {detail && !loading && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-pink-500 to-pink-700 rounded-xl p-5 text-white">
            <p className="text-sm font-semibold opacity-80">Unidad</p>
            <p className="text-2xl font-bold">{detail.directora.unidad}</p>
            <p className="text-sm opacity-80 mt-0.5">Directora: {detail.directora.name}</p>
            <div className="flex gap-6 mt-3 text-sm">
              <div><p className="opacity-70">Prod. Bruta</p><p className="font-bold">{fmt(detail.totalBruta)}</p></div>
              <div><p className="opacity-70">Prod. Neta</p><p className="font-bold">{fmt(detail.totalNeta)}</p></div>
              <div><p className="opacity-70">Miembros</p><p className="font-bold">{detail.miembros.length}</p></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800 text-sm">Miembros - {MONTHS[detail.month - 1]} {detail.year}</p>
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
                    <th className="px-4 py-3 text-center">% Cumpl.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detail.miembros.map((m, i) => (
                    <tr key={m.sapUserId} className={`hover:bg-gray-50 ${m.ventas === 0 ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{m.name}</span>
                        {m.esDirectora && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Dir.</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{m.ventas > 0 ? fmt(m.ventas) : '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{m.pedidos}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{m.meta > 0 ? fmt(m.meta) : '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {m.meta > 0 ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.pct >= 100 ? 'bg-green-100 text-green-700' : m.pct >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                            {m.pct.toFixed(0)}%
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {!detail && !loading && (
        <div className="text-center py-12 text-gray-400">
          <I icon="fa-solid fa-building" className="text-5xl mb-3 block" />
          <p>Selecciona una unidad para ver su detalle</p>
        </div>
      )}
    </div>
  );
}

// ─── Panel: Directoras ────────────────────────────────────────────────────────

function DirectorasPanel({ unidades, month, year }: { month: number; year: number; unidades: UnidadRow[] }) {
  const [search, setSearch]             = useState('');
  const [modalOpen, setModalOpen]       = useState(false);
  const [detail, setDetail]             = useState<UnitDetail | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  const filtered = unidades.filter(u =>
    u.nombre.toLowerCase().includes(search.toLowerCase()) ||
    u.unidad.toLowerCase().includes(search.toLowerCase())
  );

  const openDetail = async (directoraId: string) => {
    setDetail(null); setModalOpen(true); setLoadingModal(true);
    try {
      const r = await api.get<UnitDetail>(`/superadmin/unit/${directoraId}`, { params: { month, year } });
      setDetail(r.data);
    } finally { setLoadingModal(false); }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar directora o unidad..."
          className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
        <I icon="fa-solid fa-magnifying-glass" className="absolute right-3 top-3.5 text-gray-400 text-sm" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm"><I icon="fa-solid fa-id-card" className="mr-2 text-pink-500" />Directoras registradas</p>
          <span className="text-xs text-gray-400">{filtered.length} directoras</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-center w-8">#</th>
                <th className="px-4 py-3 text-left">Directora</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-right">Miembros</th>
                <th className="px-4 py-3 text-right">Prod. Bruta</th>
                <th className="px-4 py-3 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u, i) => (
                <tr key={u.sapUserId} className={`hover:bg-gray-50 transition-colors ${u.compraBruta === 0 ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-purple-600 text-xs font-bold">{u.nombre.charAt(0)}</span>
                      </div>
                      <span className="font-medium text-gray-900">{u.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.unidad || <span className="italic text-gray-300">Sin nombre</span>}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{u.miembros}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-700">{u.compraBruta > 0 ? fmt(u.compraBruta) : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openDetail(u.directoraId)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors">
                      <I icon="fa-solid fa-users" className="text-xs" />Ver grupo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setModalOpen(false); setDetail(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              {loadingModal ? <p className="font-semibold text-gray-700">Cargando...</p>
                : detail ? <div><p className="font-bold text-gray-900">{detail.directora.unidad || detail.directora.name}</p><p className="text-xs text-gray-400 mt-0.5">Directora: {detail.directora.name} &middot; {detail.miembros.length} miembros</p></div>
                : null}
              <button onClick={() => { setModalOpen(false); setDetail(null); }} className="text-gray-400 hover:text-gray-600 ml-4"><I icon="fa-solid fa-xmark" className="text-xl" /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadingModal && <div className="flex items-center justify-center py-16 text-gray-400"><I icon="fa-solid fa-spinner fa-spin" className="text-3xl" /></div>}
              {!loadingModal && detail && (
                <>
                  <div className="grid grid-cols-3 gap-px bg-gray-100">
                    <div className="bg-white px-5 py-4"><p className="text-xs text-gray-500 font-semibold uppercase">Prod. Bruta</p><p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(detail.totalBruta)}</p></div>
                    <div className="bg-white px-5 py-4"><p className="text-xs text-gray-500 font-semibold uppercase">Prod. Neta</p><p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(detail.totalNeta)}</p></div>
                    <div className="bg-white px-5 py-4"><p className="text-xs text-gray-500 font-semibold uppercase">Miembros</p><p className="text-lg font-bold text-gray-900 mt-0.5">{detail.miembros.length}</p></div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0"><tr className="text-gray-500 text-xs uppercase border-b border-gray-100">
                      <th className="px-5 py-3 text-left">Nombre</th>
                      <th className="px-5 py-3 text-right">Ventas</th>
                      <th className="px-5 py-3 text-right">Pedidos</th>
                      <th className="px-5 py-3 text-center">Avance</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.miembros.map(m => (
                        <tr key={m.sapUserId} className={`hover:bg-gray-50 ${m.ventas === 0 ? 'opacity-40' : ''}`}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-pink-600 text-xs font-bold">{m.name.charAt(0)}</span></div>
                              <span className="font-medium text-gray-800">{m.name}</span>
                              {m.esDirectora && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Dir.</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-800">{m.ventas > 0 ? fmt(m.ventas) : '-'}</td>
                          <td className="px-5 py-3 text-right text-gray-500">{m.pedidos}</td>
                          <td className="px-5 py-3 text-center">
                            {m.meta > 0 ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.pct >= 100 ? 'bg-green-100 text-green-700' : m.pct >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>{m.pct.toFixed(0)}%</span> : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel: Metas ─────────────────────────────────────────────────────────────

function MetasPanel({ month, year }: { month: number; year: number }) {
  const [grupos, setGrupos]         = useState<MetaGrupo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [modal, setModal]           = useState<MetaGrupo | null>(null);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState('');
  const [inputs, setInputs]         = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<MetasResponse>('/superadmin/metas', { params: { month, year } });
      setGrupos(r.data.grupos);
    } finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const openModal = (g: MetaGrupo) => {
    const map: Record<string, string> = {};
    map[g.directoraSapId] = g.directoraMeta > 0 ? String(g.directoraMeta) : '';
    g.miembros.forEach(m => { map[m.sapUserId] = m.meta > 0 ? String(m.meta) : ''; });
    setInputs(map); setModal(g);
  };

  const distribuirEquitativo = () => {
    if (!modal) return;
    const total = parseFloat(inputs[modal.directoraSapId] || '0');
    if (!total || modal.miembros.length === 0) return;
    const perMember = Math.round(total / modal.miembros.length);
    const newInputs = { ...inputs };
    modal.miembros.forEach(m => { newInputs[m.sapUserId] = String(perMember); });
    setInputs(newInputs);
  };

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const targets = Object.entries(inputs).map(([sapUserId, val]) => ({ sapUserId, amount: parseFloat(val) || 0 })).filter(t => t.amount >= 0);
      await api.put('/superadmin/metas', { month, year, targets });
      await load();
      setModal(null);
    } catch { alert('Error guardando metas'); } finally { setSaving(false); }
  };

  const totalMetas = grupos.reduce((s, g) => s + g.directoraMeta, 0);
  const gruposConMeta = grupos.filter(g => g.directoraMeta > 0).length;
  const filtered = grupos.filter(g => g.directoraNombre.toLowerCase().includes(search.toLowerCase()) || g.unidad.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 uppercase font-semibold">Total Metas</p><p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalMetas)}</p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 uppercase font-semibold">Grupos con Meta</p><p className="text-2xl font-bold text-gray-900 mt-1">{gruposConMeta} <span className="text-sm font-normal text-gray-400">/ {grupos.length}</span></p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 uppercase font-semibold">Periodo</p><p className="text-2xl font-bold text-gray-900 mt-1">{MONTHS[month - 1]} {year}</p></div>
      </div>
      <div className="relative">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar directora o unidad..."
          className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
        <I icon="fa-solid fa-magnifying-glass" className="absolute right-3 top-3.5 text-gray-400 text-sm" />
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Cargando metas...</div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">Directora / Unidad</th>
                <th className="px-4 py-3 text-right">Miembros</th>
                <th className="px-4 py-3 text-right">Meta Directora</th>
                <th className="px-4 py-3 text-right">Meta Consultoras</th>
                <th className="px-4 py-3 text-center">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(g => {
                const totalConsultoras = g.miembros.reduce((s, m) => s + m.meta, 0);
                return (
                  <tr key={g.directoraId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-pink-600 text-xs font-bold">{g.directoraNombre.charAt(0)}</span></div>
                        <div><p className="font-medium text-gray-900">{g.directoraNombre}</p><p className="text-xs text-gray-400">{g.unidad}</p></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{g.miembros.length}</td>
                    <td className="px-4 py-3 text-right font-medium">{g.directoraMeta > 0 ? <span className="text-gray-900">{fmt(g.directoraMeta)}</span> : <span className="text-gray-300 italic text-xs">Sin meta</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{totalConsultoras > 0 ? fmt(totalConsultoras) : <span className="text-gray-300 text-xs italic">Sin asignar</span>}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openModal(g)} className="inline-flex items-center gap-1.5 text-xs font-medium bg-pink-50 text-pink-700 hover:bg-pink-100 px-3 py-1.5 rounded-lg transition-colors">
                        <I icon="fa-solid fa-pen-to-square" className="text-xs" />Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div><p className="font-bold text-gray-900">{modal.unidad}</p><p className="text-xs text-gray-400">{modal.directoraNombre} - {MONTHS[month - 1]} {year}</p></div>
              <button onClick={() => !saving && setModal(null)} className="text-gray-400 hover:text-gray-600"><I icon="fa-solid fa-xmark" className="text-xl" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Meta de la Directora</label>
                <input type="number" min="0" placeholder="0" value={inputs[modal.directoraSapId] ?? ''}
                  onChange={e => setInputs({ ...inputs, [modal.directoraSapId]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
              </div>
              {modal.miembros.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Metas por Consultora ({modal.miembros.length})</label>
                    <button onClick={distribuirEquitativo} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                      <I icon="fa-solid fa-calculator" className="text-xs" />Distribuir equitativamente
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {modal.miembros.map(m => (
                      <div key={m.sapUserId} className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-pink-600 text-xs font-bold">{m.name.charAt(0)}</span></div>
                        <span className="flex-1 text-sm text-gray-700 truncate">{m.name}</span>
                        <input type="number" min="0" placeholder="0" value={inputs[m.sapUserId] ?? ''}
                          onChange={e => setInputs({ ...inputs, [m.sapUserId]: e.target.value })}
                          className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-pink-300" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                    <span className="text-gray-500">Total consultoras:</span>
                    <span className="font-semibold text-gray-800">{fmt(modal.miembros.reduce((s, m) => s + (parseFloat(inputs[m.sapUserId] || '0') || 0), 0))}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setModal(null)} disabled={saving} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors disabled:opacity-60">
                {saving ? <I icon="fa-solid fa-spinner fa-spin" className="text-xs" /> : <I icon="fa-solid fa-floppy-disk" className="text-xs" />}
                {saving ? 'Guardando...' : 'Guardar Metas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pagina principal ─────────────────────────────────────────────────────────

type SuperAdminTab = 'ranking' | 'directoras' | 'metas' | 'persona' | 'unidad';
const VALID_TABS: SuperAdminTab[] = ['ranking', 'directoras', 'metas', 'persona', 'unidad'];
function parseTab(raw: string | null): SuperAdminTab {
  return VALID_TABS.includes(raw as SuperAdminTab) ? (raw as SuperAdminTab) : 'ranking';
}

export default function SuperAdminPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  const [tab, setTab] = useState<SuperAdminTab>(() => parseTab(tabParam ?? null));

  // Sincroniza el estado con el path param (navegación externa, ej: sidebar)
  useEffect(() => {
    setTab(parseTab(tabParam ?? null));
  }, [tabParam]);

  // Navegar a la URL correcta cuando el usuario hace click en los tabs internos
  const goTab = (t: SuperAdminTab) => {
    navigate(t === 'ranking' ? '/superadmin' : `/superadmin/${t}`, { replace: true });
  };
  const [data, setData]   = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<OverviewResponse>('/superadmin/overview', { params: { month, year } });
      setData(r.data);
    } finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const TABS: { key: typeof tab; icon: string; label: string }[] = [
    { key: 'ranking',    icon: 'fa-solid fa-trophy',           label: 'Ranking Unidades' },
    { key: 'directoras', icon: 'fa-solid fa-id-card',          label: 'Directoras'       },
    { key: 'metas',      icon: 'fa-solid fa-bullseye',         label: 'Metas'            },
    { key: 'persona',    icon: 'fa-solid fa-magnifying-glass', label: 'Buscar Persona'   },
    { key: 'unidad',     icon: 'fa-solid fa-building',         label: 'Ver Unidad'       },
  ];

  const r = data?.resumen;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <I icon="fa-solid fa-crown" className="text-yellow-500" />Super Admin
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Vista global del negocio</p>
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

        {/* KPI Cards */}
        {loading && <div className="text-center py-8 text-gray-400"><I icon="fa-solid fa-spinner fa-spin" className="text-3xl" /></div>}
        {r && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                icon="fa-solid fa-bolt" iconBg="bg-yellow-100" iconColor="text-yellow-600"
                label="Ventas del Dia" value={fmt(r.todaySales)}
                compareLabel="vs. ayer" delta={deltaPct(r.todaySales, r.yesterdaySales)}
              />
              <KpiCard
                icon="fa-solid fa-bag-shopping" iconBg="bg-pink-100" iconColor="text-pink-600"
                label="Ventas del Mes" value={fmt(r.totalBruta)}
                compareLabel="vs. mes anterior" delta={deltaPct(r.totalBruta, r.lastMonthBruta)}
              />
              <KpiCard
                icon="fa-solid fa-user-group" iconBg="bg-blue-100" iconColor="text-blue-600"
                label="Consultoras Activas" value={r.consultorasActivas.toLocaleString()}
                compareLabel="vs. mes anterior" delta={deltaPct(r.consultorasActivas, r.lastMonthConsultorasActivas)}
              />
              <KpiCard
                icon="fa-solid fa-building" iconBg="bg-purple-100" iconColor="text-purple-600"
                label="Unidades Activas" value={`${r.unidadesActivas} / ${r.unidadesCount}`}
                compareLabel="vs. mes anterior" delta={deltaPct(r.unidadesActivas, r.lastMonthUnidadesActivas)}
              />
            </div>

            {/* Graficas y resumen — solo en tab Ranking */}
            {tab === 'ranking' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <ProduccionPorNivel unidades={data!.unidades} />
                  </div>
                  <AvanceGauge produccion={r.totalBruta} meta={r.totalMetas} />
                  <RankingTop5 personas={data!.rankingPersonas ?? []} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-1">
                    <TermometroGlobal produccion={r.totalBruta} meta={r.totalMetas} month={month} year={year} />
                  </div>
                  <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Resumen Global - {MONTHS[month - 1]} {year}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Produccion Bruta', value: fmt(r.totalBruta), color: 'text-pink-700' },
                        { label: 'Produccion Neta',  value: fmt(r.totalNeta),  color: 'text-gray-900' },
                        { label: 'Total Pedidos',    value: r.totalPedidos.toLocaleString(), color: 'text-gray-900' },
                        { label: 'Total Unidades',   value: String(r.unidadesCount), color: 'text-gray-900' },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                          <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => goTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <I icon={t.icon} className="text-xs" />{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {!loading && data && tab === 'ranking' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.unidades.map((u, i) => (
                    <tr key={u.sapUserId} className={`hover:bg-gray-50 ${u.compraBruta === 0 ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 text-center"><Medal pos={i} /></td>
                      <td className="px-4 py-3 font-medium text-gray-900">{u.unidad}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.nombre}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{u.miembros}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(u.compraBruta)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(u.compraNeta)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${u.rate >= 0.14 ? 'bg-purple-100 text-purple-700' : u.rate >= 0.08 ? 'bg-green-100 text-green-700' : u.rate >= 0.06 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {u.rate > 0 ? pct(u.rate) : '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-pink-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 font-bold text-pink-800">TOTAL</td>
                    <td className="px-4 py-3 text-right font-bold text-pink-800">{r && fmt(r.totalBruta)}</td>
                    <td className="px-4 py-3 text-right font-bold text-pink-800">{r && fmt(r.totalNeta)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {tab === 'metas'      && <MetasPanel month={month} year={year} />}
        {!loading && data && tab === 'directoras' && <DirectorasPanel unidades={data.unidades} month={month} year={year} />}
        {tab === 'persona'    && <BuscarPersona month={month} year={year} />}
        {tab === 'unidad'     && data && <VerUnidad month={month} year={year} unidades={data.unidades} />}

      </div>
    </Layout>
  );
}
