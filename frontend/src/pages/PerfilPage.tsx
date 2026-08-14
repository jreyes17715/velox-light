import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../utils/api';
import { DiqProgressCard, DiqProgress } from '../components/Common/DiqProgressCard';

// ─── Tipos ────────────────────────────────────────────────

interface CreditNote {
  id: string;
  sapDocNum: number;
  sapDocEntry: string;
  amount: number;
  docDate: string;
  comments: string | null;
  ncfRef: string | null;
  ncfNC: string | null;
  cancelled: boolean;
}

interface ProfileData {
  user: {
    id: string; sapUserId: string; name: string; email: string | null;
    role: string; unitName: string | null; isSuperAdmin: boolean;
  };
  mesActual: { month: number; year: number; ventas: number; pedidos: number; meta: number; };
  historial: { month: number; year: number; ventas: number; pedidos: number; meta: number; }[];
  reclutas: { name: string; sapUserId: string; role: string; }[];
  supervisora: { name: string; sapUserId: string; unitName: string | null; } | null;
  subordinadasCount: number;
  subordinadas: { id: string; name: string; sapUserId: string; role: string; }[];
  creditNotes: CreditNote[];
  totalCreditNotesMes: number;
  diq: DiqProgress | null;
}

// ─── Helpers ────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const I = ({ icon, className = '' }: { icon: string; className?: string }) => (
  <i className={`${icon} fa-fw ${className}`} aria-hidden="true" />
);

// ─── Pagina ────────────────────────────────────────────────

export default function PerfilPage() {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const [data, setData]       = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<'resumen' | 'nc'>('resumen');
  const [ncFilter, setNcFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    setData(null);
    const endpoint = userId ? `/profile/${userId}` : '/profile/me';
    api.get<ProfileData>(endpoint)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error ?? 'Error cargando perfil'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <Layout><div className="flex items-center justify-center h-64 text-gray-400"><I icon="fa-solid fa-spinner fa-spin" className="text-3xl" /></div></Layout>;
  if (error)   return <Layout><div className="p-6 text-red-600">{error}</div></Layout>;
  if (!data)   return null;

  const { user, mesActual, historial, reclutas, supervisora, subordinadasCount, subordinadas, creditNotes, totalCreditNotesMes, diq } = data;
  const achievement = mesActual.meta > 0 ? Math.min((mesActual.ventas / mesActual.meta) * 100, 100) : 0;
  const roleLabel = user.isSuperAdmin ? 'Super Admin'
    : user.role === 'directora' ? 'Directora'
    : user.role === 'diq' ? 'En proceso DEC'
    : user.role === 'iniciadora' ? 'Iniciadora'
    : 'Consultora';

  const filteredNC = creditNotes.filter(n =>
    !ncFilter ||
    String(n.sapDocNum).includes(ncFilter) ||
    (n.ncfRef ?? '').toLowerCase().includes(ncFilter.toLowerCase()) ||
    (n.ncfNC  ?? '').toLowerCase().includes(ncFilter.toLowerCase()) ||
    (n.comments ?? '').toLowerCase().includes(ncFilter.toLowerCase())
  );

  const TABS = [
    { key: 'resumen' as const, icon: 'fa-solid fa-chart-simple', label: 'Resumen' },
    { key: 'nc'      as const, icon: 'fa-solid fa-file-circle-minus', label: `Notas de Credito (${creditNotes.length})` },
  ];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-5">

        {/* Banner modo Super Admin */}
        {userId && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-blue-700">
              <I icon="fa-solid fa-eye" className="mr-2" />
              Viendo el perfil de <span className="font-semibold">{user.name}</span> (modo Super Admin)
            </p>
            <button onClick={() => navigate(-1)} className="text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1">
              <I icon="fa-solid fa-arrow-left" />Volver
            </button>
          </div>
        )}

        {/* Header perfil */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center gap-5">
          <div className="w-16 h-16 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl font-bold">{user.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{user.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-block bg-pink-100 text-pink-700 text-xs font-semibold px-2 py-0.5 rounded-full capitalize">
                {roleLabel}
              </span>
              {user.unitName && (
                <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  <I icon="fa-solid fa-star" className="text-pink-400 mr-1" />{user.unitName}
                </span>
              )}
              {user.isSuperAdmin && (
                <span className="inline-block bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  <I icon="fa-solid fa-crown" className="mr-1" />Super Admin
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">ID SAP: {user.sapUserId}{user.email ? ` · ${user.email}` : ''}</p>
          </div>
        </div>

        {/* Progreso DIQ */}
        {diq && <DiqProgressCard diq={diq} />}

        {/* Stats del mes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Ventas del Mes</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fmt(mesActual.ventas)}</p>
            {totalCreditNotesMes > 0 && (
              <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                <I icon="fa-solid fa-triangle-exclamation" className="text-[10px]" />
                NC: -{fmt(totalCreditNotesMes)}
              </p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Pedidos</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{mesActual.pedidos}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Meta</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{mesActual.meta > 0 ? fmt(mesActual.meta) : '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Cumplimiento</p>
            <p className={`text-xl font-bold mt-1 ${achievement >= 100 ? 'text-green-600' : achievement >= 70 ? 'text-yellow-600' : 'text-red-500'}`}>
              {mesActual.meta > 0 ? `${achievement.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Barra de progreso meta */}
        {mesActual.meta > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold text-gray-700">Progreso hacia la meta</span>
              <span className="text-gray-500">{fmt(mesActual.ventas)} / {fmt(mesActual.meta)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${achievement >= 100 ? 'bg-green-500' : 'bg-pink-500'}`} style={{ width: `${achievement}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {achievement >= 100 ? 'Meta superada!' : `Faltan ${fmt(mesActual.meta - mesActual.ventas)} para la meta`}
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-700'}`}>
              <I icon={t.icon} className="text-xs" />{t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Resumen ── */}
        {tab === 'resumen' && (
          <>
            {/* Historial 6 meses */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4 text-sm">
                <I icon="fa-solid fa-chart-bar" className="mr-2 text-pink-500" />Historial - Ultimos 6 Meses
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={historial} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey={d => MONTHS_SHORT[d.month - 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    labelFormatter={(_, p) => p[0] ? `${MONTHS_SHORT[p[0].payload.month - 1]} ${p[0].payload.year}` : ''}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                    {historial.map((_entry, i) => (
                      <Cell key={i} fill={i === historial.length - 1 ? '#ec4899' : '#f9a8d4'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Estructura */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-3 text-sm">
                  <I icon="fa-solid fa-sitemap" className="mr-2 text-pink-500" />Estructura
                </h2>
                <div className="space-y-2 text-sm">
                  {supervisora && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Directora / Supervisora</span>
                      <span className="font-medium text-gray-800 text-right">{supervisora.name}</span>
                    </div>
                  )}
                  {(user.role === 'directora' || user.role === 'diq') && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{user.role === 'diq' ? 'Consultoras DEC' : 'Consultoras en unidad'}</span>
                      <span className="font-medium text-gray-800">{subordinadasCount}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reclutas personales</span>
                    <span className="font-medium text-gray-800">{reclutas.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Notas de credito</span>
                    <span className={`font-medium ${creditNotes.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {creditNotes.length} {creditNotes.length > 0 && `(${fmt(totalCreditNotesMes)} este mes)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reclutas */}
              {reclutas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-800 mb-3 text-sm">
                    <I icon="fa-solid fa-user-plus" className="mr-2 text-pink-500" />Mis Reclutas ({reclutas.length})
                  </h2>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {reclutas.map(r => (
                      <div key={r.sapUserId} className="flex items-center justify-between text-sm py-0.5">
                        <span className="text-gray-700 truncate">{r.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${r.role === 'directora' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                          {r.role === 'directora' ? 'Directora' : 'Consultora'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grupo DIQ */}
              {user.role === 'diq' && subordinadas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-800 mb-3 text-sm">
                    <I icon="fa-solid fa-users" className="mr-2 text-pink-500" />Grupo DEC ({subordinadas.length})
                  </h2>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {subordinadas.map(s => (
                      <div key={s.sapUserId} className="flex items-center justify-between text-sm py-0.5">
                        <span className="text-gray-700 truncate">{s.name}</span>
                        <span className="text-xs text-gray-400">{s.sapUserId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Tab: Notas de Credito ── */}
        {tab === 'nc' && (
          <div className="space-y-4">
            {/* Banner resumen */}
            {creditNotes.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <I icon="fa-solid fa-circle-info" className="text-red-500 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Impacto en produccion de este mes</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Las notas de credito activas reducen tu produccion neta.
                    Este mes: <span className="font-bold">-{fmt(totalCreditNotesMes)}</span>
                  </p>
                </div>
              </div>
            )}

            {/* Buscador */}
            <div className="relative">
              <input
                type="text" value={ncFilter} onChange={e => setNcFilter(e.target.value)}
                placeholder="Buscar por N. doc, NCF, comentario..."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
              />
              <I icon="fa-solid fa-magnifying-glass" className="absolute right-3 top-3.5 text-gray-400 text-sm" />
            </div>

            {/* Tabla */}
            {filteredNC.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <I icon="fa-solid fa-file-circle-check" className="text-5xl mb-3 block text-green-300" />
                <p className="font-medium text-gray-500">{ncFilter ? 'Sin resultados' : 'Sin notas de credito registradas'}</p>
                <p className="text-xs mt-1">{!ncFilter && 'No tienes notas de credito activas'}</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800 text-sm">
                    <I icon="fa-solid fa-file-circle-minus" className="mr-2 text-red-500" />
                    {filteredNC.length} nota{filteredNC.length !== 1 ? 's' : ''} de credito
                  </p>
                  <span className="text-xs text-gray-400">Total: {fmt(filteredNC.reduce((s, n) => s + n.amount, 0))}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">N. Doc</th>
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">NCF Factura</th>
                        <th className="px-4 py-3 text-left">NCF de NC</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3 text-left">Comentario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredNC.map(n => (
                        <tr key={n.id} className={`hover:bg-gray-50 ${n.cancelled ? 'opacity-40 line-through' : ''}`}>
                          <td className="px-4 py-3 font-medium text-gray-700">#{n.sapDocNum}</td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {new Date(n.docDate).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">{n.ncfRef ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 font-mono">{n.ncfNC ?? '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-600">-{fmt(n.amount)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title={n.comments ?? undefined}>
                            {n.comments ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-red-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-xs font-bold text-red-700">TOTAL MOSTRADO</td>
                        <td className="px-4 py-2 text-right text-xs font-bold text-red-700">
                          -{fmt(filteredNC.reduce((s, n) => s + n.amount, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
