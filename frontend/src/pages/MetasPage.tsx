import { useEffect, useState, useCallback } from 'react';
import { Layout } from '../components/Layout/Layout';
import api from '../utils/api';

interface MetaMember {
  id:            string;
  sapUserId:     string;
  name:          string;
  role:          string;
  isDirectora:   boolean;
  currentTarget: number;
}

interface MetasData {
  month:            number;
  year:             number;
  unitGoal:         number;
  totalDistributed: number;
  members:          MetaMember[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', maximumFractionDigits: 0,
  }).format(n);
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function MetasPage() {
  const now  = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [data,    setData]    = useState<MetasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [inputs,  setInputs]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const r = await api.get<MetasData>('/dashboard/metas', { params: { month, year } });
      setData(r.data);
      const init: Record<string, string> = {};
      r.data.members.forEach(m => {
        init[m.sapUserId] = m.currentTarget > 0 ? String(m.currentTarget) : '';
      });
      setInputs(init);
    } catch {
      setError('Error cargando metas.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const handleNext = () => {
    const isCurrent = year === now.getFullYear() && month >= now.getMonth() + 1;
    if (isCurrent) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleEquitativa = () => {
    if (!data || data.unitGoal <= 0) return;
    const n = data.members.length;
    if (n === 0) return;
    const porcion = Math.floor(data.unitGoal / n);
    const resto   = data.unitGoal - porcion * n;
    const next: Record<string, string> = {};
    data.members.forEach((m, i) => {
      next[m.sapUserId] = String(i === 0 ? porcion + resto : porcion);
    });
    setInputs(next);
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const targets = data.members.map(m => ({
        sapUserId: m.sapUserId,
        amount:    parseFloat(inputs[m.sapUserId] || '0') || 0,
      }));
      await api.put('/dashboard/metas', { month, year, targets });
      setSaved(true);
      await load();
    } catch {
      setError('Error guardando metas.');
    } finally {
      setSaving(false);
    }
  };

  const totalInputs = data
    ? data.members.reduce((s, m) => s + (parseFloat(inputs[m.sapUserId] || '0') || 0), 0)
    : 0;

  const pctDistribuido = data && data.unitGoal > 0
    ? Math.min((totalInputs / data.unitGoal) * 100, 999)
    : 0;

  const getBarColor = (pct: number) =>
    pct >= 100 ? '#16a34a' : pct >= 70 ? '#db2777' : '#f59e0b';

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">

        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Metas</h2>
            <p className="text-xs text-gray-500">Distribucion de objetivos por periodo</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <button onClick={handlePrev} className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none">&lsaquo;</button>
            <span className="text-sm font-medium text-gray-700 min-w-36 text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={handleNext} className="text-gray-400 hover:text-gray-600 font-bold text-lg leading-none">&rsaquo;</button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-4xl mx-auto w-full">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
          )}

          {loading && (
            <div className="py-16 text-center text-gray-400">
              <i className="fa-solid fa-spinner fa-spin text-3xl" />
            </div>
          )}

          {!loading && data && (
            <>
              {/* Meta de Unidad banner */}
              <div className={`rounded-xl p-5 ${data.unitGoal > 0 ? 'bg-sky-50 border border-sky-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-600 mb-1">
                      <i className="fa-solid fa-crown mr-1.5 text-yellow-500" />
                      Meta de Unidad &mdash; asignada por Administrador
                    </p>
                    {data.unitGoal > 0 ? (
                      <p className="text-3xl font-bold text-gray-900">{fmt(data.unitGoal)}</p>
                    ) : (
                      <p className="text-sm text-amber-700 font-medium mt-1">
                        El administrador aun no ha asignado una meta de unidad para {MONTHS[month - 1]} {year}.
                      </p>
                    )}
                  </div>
                  {data.unitGoal > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-0.5">Distribuido</p>
                      <p className="text-lg font-bold text-gray-800">{fmt(totalInputs)}</p>
                      <p className={`text-xs font-semibold ${totalInputs > data.unitGoal ? 'text-red-600' : 'text-gray-500'}`}>
                        {totalInputs > data.unitGoal
                          ? `+${fmt(totalInputs - data.unitGoal)} por encima`
                          : totalInputs < data.unitGoal
                          ? `${fmt(data.unitGoal - totalInputs)} pendiente`
                          : 'Distribucion exacta'}
                      </p>
                    </div>
                  )}
                </div>
                {data.unitGoal > 0 && (
                  <div className="mt-4">
                    <div className="w-full bg-sky-100 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(pctDistribuido, 100)}%`,
                          backgroundColor: totalInputs > data.unitGoal ? '#dc2626' : '#0284c7',
                        }}
                      />
                    </div>
                    <p className="text-xs text-sky-600 mt-1 font-medium">
                      {pctDistribuido.toFixed(1)}% distribuido
                    </p>
                  </div>
                )}
              </div>

              {/* Distribucion */}
              {data.unitGoal > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-800">Distribuir meta entre miembros</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {data.members.length} miembro{data.members.length !== 1 ? 's' : ''} &middot;
                        Directora + {data.members.length - 1} consultora{data.members.length - 1 !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={handleEquitativa}
                      className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      <i className="fa-solid fa-equals text-xs" />
                      Distribuir equitativamente
                    </button>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {data.members.map(m => {
                      const inputVal = inputs[m.sapUserId] ?? '';
                      const amount   = parseFloat(inputVal || '0') || 0;
                      const pct      = data.unitGoal > 0 ? (amount / data.unitGoal) * 100 : 0;
                      return (
                        <div key={m.sapUserId} className="py-3 flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            m.isDirectora ? 'bg-sky-100' : 'bg-pink-100'
                          }`}>
                            <span className={`text-xs font-bold ${m.isDirectora ? 'text-sky-700' : 'text-pink-600'}`}>
                              {m.name.charAt(0)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-800 truncate">{m.name}</span>
                              {m.isDirectora && (
                                <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                                  Directora
                                </span>
                              )}
                            </div>
                            {amount > 0 && (
                              <div className="mt-1 w-full bg-gray-100 rounded-full h-1">
                                <div
                                  className="h-1 rounded-full"
                                  style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: getBarColor(pct) }}
                                />
                              </div>
                            )}
                          </div>
                          {amount > 0 && (
                            <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
                              {pct.toFixed(0)}%
                            </span>
                          )}
                          <div className="flex-shrink-0">
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              placeholder="0"
                              value={inputVal}
                              onChange={e => setInputs(prev => ({ ...prev, [m.sapUserId]: e.target.value }))}
                              className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-400"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                    <div className="text-sm">
                      <span className="text-gray-500">Total asignado: </span>
                      <span className={`font-bold ${totalInputs > data.unitGoal ? 'text-red-600' : 'text-gray-800'}`}>
                        {fmt(totalInputs)}
                      </span>
                      {data.unitGoal > 0 && (
                        <span className="text-gray-400 ml-1">/ {fmt(data.unitGoal)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {saved && (
                        <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                          <i className="fa-solid fa-circle-check" /> Guardado
                        </span>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                      >
                        {saving
                          ? <><i className="fa-solid fa-spinner fa-spin text-xs" /> Guardando...</>
                          : <><i className="fa-solid fa-floppy-disk text-xs" /> Guardar distribucion</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen guardado */}
              {data.members.some(m => m.currentTarget > 0) && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-800">Distribucion guardada &mdash; {MONTHS[month - 1]} {year}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Metas actualmente en base de datos</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {data.members.filter(m => m.currentTarget > 0).map(m => (
                      <div key={m.sapUserId} className="px-5 py-3 flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          m.isDirectora ? 'bg-sky-100' : 'bg-pink-100'
                        }`}>
                          <span className={`text-xs font-bold ${m.isDirectora ? 'text-sky-700' : 'text-pink-600'}`}>
                            {m.name.charAt(0)}
                          </span>
                        </div>
                        <span className="flex-1 text-sm text-gray-700 truncate">{m.name}</span>
                        <span className="text-xs text-gray-400">
                          {data.unitGoal > 0
                            ? `${((m.currentTarget / data.unitGoal) * 100).toFixed(1)}%`
                            : ''}
                        </span>
                        <span className="text-sm font-semibold text-gray-800 w-32 text-right">
                          {fmt(m.currentTarget)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
