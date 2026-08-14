import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout/Layout';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';

interface MesProduccion { month: number; year: number; bruta: number; neta: number; cumpleMinimo: boolean; }
interface KPIs {
  consultoras:  { total: number; activas: number; meta: number; pct: number };
  produccion:   {
    bruta: number; neta: number; meta: number; metaMensual: number; pct: number;
    porMes: MesProduccion[]; mesesCumplidos: number; mesesTotal: number;
    cumpleTodosLosMeses: boolean; cumpleAcumulado: boolean; aprobada: boolean;
  };
  iniciaciones: { total: number; meta: number; pct: number };
}

const MES_NOMBRE = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
interface DIQRow {
  id: string; startDate: string; endDate: string; status: string; notes: string | null;
  user: { name: string; sapUserId: string };
  registeredBy: { name: string };
  kpis: KPIs;
}
interface UserOption { id: string; name: string; sapUserId: string; }
interface MemberOption {
  id: string; name: string; sapUserId: string; role: string;
  supervisor: { name: string; unitName: string | null } | null;
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

function KPIBar({ label, value, meta, pct, fmt: fmtFn }: {
  label: string; value: number; meta: number; pct: number; fmt: (n: number) => string;
}) {
  const color = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-400' : 'bg-pink-500';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{fmtFn(value)} / {fmtFn(meta)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5 text-right">{pct.toFixed(0)}%</p>
    </div>
  );
}

function diasRestantes(endDate: string) {
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
}

function RegistrarDIQModal({ onClose, onSaved, isSuperAdmin }: {
  onClose: () => void; onSaved: () => void; isSuperAdmin: boolean;
}) {
  const [candidatos,   setCandidatos]   = useState<UserOption[]>([]);
  const [allMembers,   setAllMembers]   = useState<MemberOption[]>([]);
  const [userId,       setUserId]       = useState('');
  const [notes,        setNotes]        = useState('');
  const [memberIds,    setMemberIds]    = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  useEffect(() => {
    api.get<UserOption[]>('/diq/candidates').then(r => setCandidatos(r.data)).catch(() => {});
    if (isSuperAdmin) {
      api.get<MemberOption[]>('/diq/available-members').then(r => setAllMembers(r.data)).catch(() => {});
    }
  }, [isSuperAdmin]);

  const toggleMember = (id: string) =>
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filteredMembers = allMembers.filter(m =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.sapUserId.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const handleSave = async () => {
    if (!userId) { setError('Selecciona una candidata'); return; }
    setSaving(true); setError(null);
    try {
      await api.post('/diq', { userId, notes, ...(isSuperAdmin ? { memberIds } : {}) });
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'Error registrando DEC');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">Registrar Nueva DEC</h2>
        <p className="text-sm text-gray-500">El periodo de 3 meses inicia desde hoy. La candidata pasara a rol DEC.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Candidata DEC</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option value="">Seleccionar consultora...</option>
              {candidatos.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.sapUserId})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
              placeholder="Observaciones del proceso..." />
          </div>
        </div>

        {isSuperAdmin && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">
                Asignar consultoras al grupo DEC
                {memberIds.length > 0 && (
                  <span className="ml-2 bg-pink-100 text-pink-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {memberIds.length} seleccionadas
                  </span>
                )}
              </label>
              {memberIds.length > 0 && (
                <button onClick={() => setMemberIds([])} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  Limpiar
                </button>
              )}
            </div>
            <input type="text" value={memberSearch} onChange={e => setMemberSearch(e.target.value)}
              placeholder="Buscar por nombre o codigo..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-pink-300" />
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
              {filteredMembers.length === 0 && (
                <p className="text-xs text-gray-400 p-3 text-center">No hay consultoras disponibles</p>
              )}
              {filteredMembers.map(m => (
                <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)}
                    className="w-4 h-4 accent-pink-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-400">
                      {m.sapUserId}{m.supervisor ? ` - ${m.supervisor.unitName ?? m.supervisor.name}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    m.role === 'iniciadora' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                  }`}>{m.role}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">Estas consultoras quedaran bajo la supervision de la candidata DEC.</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-pink-600 text-white text-sm font-semibold rounded-lg hover:bg-pink-700 disabled:opacity-50">
            {saving ? 'Guardando...' : 'Registrar DEC'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DIQPage() {
  const { user } = useAuthStore();
  const [diqs,     setDiqs]     = useState<DIQRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [modal,    setModal]    = useState(false);
  const [selected, setSelected] = useState<DIQRow | null>(null);

  const load = () => {
    setLoading(true);
    api.get<DIQRow[]>('/diq')
      .then(r => setDiqs(r.data))
      .catch(e => setError(e.response?.data?.error ?? 'Error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const activasCount   = diqs.filter(d => d.status === 'active').length;
  const completasCount = diqs.filter(d => d.status === 'completed').length;

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidatas DEC</h1>
            <p className="text-sm text-gray-500 mt-0.5">Seguimiento de consultoras en proceso de calificacion</p>
          </div>
          {(user?.role === 'directora' || user?.isSuperAdmin) && (
            <button onClick={() => setModal(true)}
              className="bg-pink-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-pink-700">
              + Registrar DEC
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-pink-600">{activasCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">En proceso</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completasCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Completadas</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{diqs.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total historial</p>
          </div>
        </div>

        {loading && <div className="text-center py-16 text-gray-400">Cargando...</div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}
        {!loading && diqs.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Sin candidatas DEC registradas</p>
            <p className="text-sm mt-1">Usa el boton "+ Registrar DEC" para comenzar</p>
          </div>
        )}

        <div className="space-y-4">
          {diqs.map(diq => {
            const dias = diasRestantes(diq.endDate);
            const isActive = diq.status === 'active';
            return (
              <div key={diq.id}
                className={`bg-white rounded-xl border p-5 cursor-pointer hover:shadow-md transition-shadow ${
                  selected?.id === diq.id ? 'border-pink-400 shadow-md' : 'border-gray-200'
                }`}
                onClick={() => setSelected(selected?.id === diq.id ? null : diq)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{diq.user.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        isActive ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{isActive ? 'Activa' : 'Completada'}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Registrada por {diq.registeredBy.name} - Inicio {new Date(diq.startDate).toLocaleDateString('es-DO')}
                    </p>
                  </div>
                  <div className="text-right">
                    {isActive && (
                      <p className={`text-sm font-semibold ${dias <= 15 ? 'text-red-500' : dias <= 30 ? 'text-yellow-500' : 'text-gray-600'}`}>
                        {dias} dias restantes
                      </p>
                    )}
                    <p className="text-xs text-gray-400">Cierre {new Date(diq.endDate).toLocaleDateString('es-DO')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <KPIBar label="Consultoras activas" value={diq.kpis.consultoras.activas}
                    meta={diq.kpis.consultoras.meta} pct={diq.kpis.consultoras.pct} fmt={n => `${n}`} />
                  <KPIBar label="Produccion acumulada" value={diq.kpis.produccion.neta}
                    meta={diq.kpis.produccion.meta} pct={diq.kpis.produccion.pct} fmt={fmt} />
                  <KPIBar label="Nuevas iniciaciones" value={diq.kpis.iniciaciones.total}
                    meta={diq.kpis.iniciaciones.meta} pct={diq.kpis.iniciaciones.pct} fmt={n => `${n}`} />
                </div>

                {selected?.id === diq.id && (
                  <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total reclutas</p>
                        <p className="text-xl font-bold text-gray-800">{diq.kpis.consultoras.total}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Prod. bruta acumulada</p>
                        <p className="text-lg font-bold text-gray-800">{fmt(diq.kpis.produccion.bruta)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-500">Prod. neta acumulada</p>
                        <p className="text-lg font-bold text-pink-700">{fmt(diq.kpis.produccion.neta)}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Cumplimiento mensual (minimo {fmt(diq.kpis.produccion.metaMensual)}/mes)
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          diq.kpis.produccion.aprobada ? 'bg-green-100 text-green-700'
                          : diq.kpis.produccion.cumpleTodosLosMeses || diq.kpis.produccion.cumpleAcumulado ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {diq.kpis.produccion.mesesCumplidos}/{diq.kpis.produccion.mesesTotal} meses cumplidos
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {diq.kpis.produccion.porMes.map(m => (
                          <div key={`${m.year}-${m.month}`}
                            className={`rounded-lg p-3 border ${m.cumpleMinimo ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-gray-600">{MES_NOMBRE[m.month - 1]} {m.year}</p>
                              <i className={`fa-solid ${m.cumpleMinimo ? 'fa-circle-check text-green-500' : 'fa-circle-xmark text-red-400'} text-sm`} aria-hidden="true" />
                            </div>
                            <p className={`text-sm font-bold mt-1 ${m.cumpleMinimo ? 'text-green-700' : 'text-red-600'}`}>{fmt(m.neta)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-2">
                        Aprueba solo si cumple el minimo en TODOS los meses Y el acumulado llega a {fmt(diq.kpis.produccion.meta)}.
                      </p>
                    </div>

                    {diq.notes && <p className="text-sm text-gray-500 italic">Nota: {diq.notes}</p>}
                    {isActive && user?.isSuperAdmin && (
                      <div className="flex justify-end">
                        <button onClick={async e => { e.stopPropagation(); await api.patch(`/diq/${diq.id}/complete`); load(); }}
                          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700">
                          Marcar como Completada
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <RegistrarDIQModal onClose={() => setModal(false)} onSaved={load} isSuperAdmin={!!user?.isSuperAdmin} />
      )}
    </Layout>
  );
}
