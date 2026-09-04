import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import api from '../utils/api';
import { formatCurrency } from '../utils/formatters';

// ============================================================================
// Vista "Mis Iniciadoras" -- para Directoras y DEC (antes DIQ), ya que ambas
// pueden tener reclutas personales propias en SAP. Muestra en formato de
// celulas a quien el usuario reclutó personalmente (inciadoraId / U_CodIni
// de SAP, NO tiene relación con supervisorId/unidad SAP), y al expandir cada
// una, sus propias reclutas (nivel 2 fijo). Backend: GET /dashboard/iniciadoras
// -- el backend filtra siempre por el id del usuario logueado, asi que esta
// misma vista ya muestra los valores correctos para quien la abra.
// ============================================================================

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface ReclutaNivel2 {
  sapUserId: string;
  name: string;
  role: string;
  ventas: number;
  pedidos: number;
  activa: boolean;
}

interface IniciadoraNivel1 {
  sapUserId: string;
  name: string;
  role: string;
  ventasPersonales: number;
  pedidosPersonales: number;
  totalReclutas: number;
  reclutasActivas: number;
  produccionReclutas: number;
  produccionNeta: number;
  reclutas: ReclutaNivel2[];
}

interface IniciadorasResponse {
  month: number;
  year: number;
  totalReclutas: number;
  totalReclutasNivel2: number;
  produccionTotal: number;
  iniciadoras: IniciadoraNivel1[];
}

const ROLE_LABEL: Record<string, string> = {
  directora: 'Directora',
  diq: 'En proceso DEC',
  iniciadora: 'Iniciadora',
  consultora: 'Consultora',
};

function RoleBadge({ role }: { role: string }) {
  const cls = role === 'directora' ? 'bg-sky-50 text-sky-700'
    : role === 'diq' ? 'bg-amber-50 text-amber-700'
    : role === 'iniciadora' ? 'bg-purple-50 text-purple-700'
    : 'bg-gray-100 text-gray-500';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{ROLE_LABEL[role] ?? role}</span>;
}

function CelulaCard({ ini }: { ini: IniciadoraNivel1 }) {
  const [open, setOpen] = useState(false);
  const total = ini.ventasPersonales + ini.produccionReclutas;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
            <span className="text-purple-600 text-sm font-bold">{ini.name.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-800 truncate">{ini.name}</p>
              <RoleBadge role={ini.role} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {ini.totalReclutas} {ini.totalReclutas === 1 ? 'asociada' : 'asociadas'} · {ini.reclutasActivas} activa{ini.reclutasActivas === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide">Producción célula</p>
            <p className="text-sm font-bold text-purple-700">{formatCurrency(total)}</p>
          </div>
          <i className={`fa-solid fa-chevron-down text-gray-300 text-xs transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white rounded-lg border border-gray-100 p-2.5">
              <p className="text-gray-400 uppercase font-semibold text-[10px]">Producción personal</p>
              <p className="font-bold text-gray-800 mt-0.5">{formatCurrency(ini.ventasPersonales)}</p>
              <p className="text-gray-400 mt-0.5">{ini.pedidosPersonales} pedidos</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-100 p-2.5">
              <p className="text-gray-400 uppercase font-semibold text-[10px]">Producción de sus asociadas</p>
              <p className="font-bold text-gray-800 mt-0.5">{formatCurrency(ini.produccionReclutas)}</p>
              <p className="text-gray-400 mt-0.5">Neta: {formatCurrency(ini.produccionNeta)}</p>
            </div>
          </div>

          {ini.reclutas.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Todavía no ha reclutado a nadie.</p>
          ) : (
            <div className="pl-3 border-l-2 border-purple-100 space-y-2">
              {ini.reclutas.map(r => (
                <div key={r.sapUserId} className="bg-white rounded-lg border border-gray-100 p-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-500 text-[10px] font-bold">{r.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-700 truncate">{r.name}</p>
                        <RoleBadge role={r.role} />
                      </div>
                      <p className="text-[11px] text-gray-400">{r.pedidos} pedidos</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-800">{formatCurrency(r.ventas)}</p>
                    <span className={`text-[10px] font-medium ${r.activa ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {r.activa ? 'Activa' : 'Sin compras'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IniciadorasPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<IniciadorasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<IniciadorasResponse>('/dashboard/iniciadoras', { params: { month, year } });
        setData(data);
      } catch {
        setError('No se pudieron cargar tus iniciadoras.');
      } finally {
        setLoading(false);
      }
    })();
  }, [month, year]);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <i className="fa-solid fa-star text-purple-500 text-sm" aria-hidden="true" />Mis Iniciadoras
            </h2>
            <p className="text-xs text-gray-500">Personas que reclutaste personalmente, y la producción de su propio equipo</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200">
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-4xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {loading ? (
            <LoadingSpinner message="Cargando tus iniciadoras..." />
          ) : !data || data.totalReclutas === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center text-gray-400">
              <i className="fa-solid fa-star text-3xl mb-3 block text-gray-200" aria-hidden="true" />
              Todavía no tienes iniciadoras registradas.
              <p className="text-xs mt-1">Aquí aparecerán las personas que reclutes personalmente.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{data.totalReclutas}</p>
                  <p className="text-xs text-gray-500 mt-1">Asociadas directas</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{data.totalReclutasNivel2}</p>
                  <p className="text-xs text-gray-500 mt-1">Asociadas de tus asociadas</p>
                </div>
                <div className="bg-purple-50 rounded-xl border border-purple-100 p-4 text-center">
                  <p className="text-2xl font-bold text-purple-700">{formatCurrency(data.produccionTotal)}</p>
                  <p className="text-xs text-purple-600 mt-1">Producción total de la célula</p>
                </div>
              </div>

              <div className="space-y-3">
                {data.iniciadoras.map(ini => (
                  <CelulaCard key={ini.sapUserId} ini={ini} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
