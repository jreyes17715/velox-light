import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout/Layout';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import api from '../utils/api';
import { OverviewData, SubordinateData } from '../types';
import { formatCurrency, formatPercent, getMonthName } from '../utils/formatters';

export function MetasPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [subordinates, setSubordinates] = useState<SubordinateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  useEffect(() => { fetchData(); }, [month, year]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ov, subs] = await Promise.all([
        api.get<OverviewData>(`/dashboard/overview?month=${month}&year=${year}`),
        api.get<{ data: SubordinateData[] }>(`/dashboard/subordinates?month=${month}&year=${year}&limit=100`),
      ]);
      setOverview(ov.data);
      setSubordinates(subs.data.data);
    } catch {
      setError('Error cargando metas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const handleNext = () => {
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const getBarColor = (pct: number) => pct >= 100 ? '#16a34a' : pct >= 70 ? '#db2777' : '#f59e0b';

  if (isLoading) return <LoadingSpinner message="Cargando metas..." />;

  // Calcular meta colectiva del grupo
  const totalMetaGrupo = subordinates.reduce((s, c) => s + c.targetAmount, 0);
  const totalVentasGrupo = subordinates.reduce((s, c) => s + c.totalSales, 0);
  const pctGrupo = totalMetaGrupo > 0 ? (totalVentasGrupo / totalMetaGrupo) * 100 : 0;

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Metas</h2>
            <p className="text-xs text-gray-500">Seguimiento de objetivos por período</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <button onClick={handlePrev} className="text-gray-400 hover:text-gray-600 font-bold">‹</button>
            <span className="text-sm font-medium text-gray-700 min-w-36 text-center">
              {months[month - 1]} {year}
            </span>
            <button onClick={handleNext} className="text-gray-400 hover:text-gray-600 font-bold">›</button>
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {/* Meta personal de la directora */}
          {overview && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Mi meta personal — {getMonthName(month)} {year}</h3>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="bg-pink-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500">Meta</p>
                  <p className="text-xl font-bold text-gray-800">{formatCurrency(overview.targetAmount)}</p>
                </div>
                <div className="bg-pink-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500">Producido</p>
                  <p className="text-xl font-bold text-pink-600">{formatCurrency(overview.totalSales)}</p>
                </div>
                <div className="bg-pink-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500">Faltante</p>
                  <p className="text-xl font-bold text-amber-600">
                    {formatCurrency(Math.max(overview.targetAmount - overview.totalSales, 0))}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Avance</span>
                  <span className="font-semibold">{formatPercent(overview.achievementPercent)}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="h-3 rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(overview.achievementPercent, 100)}%`,
                      backgroundColor: getBarColor(overview.achievementPercent),
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Meta colectiva del grupo */}
          {subordinates.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-1">Meta colectiva del grupo</h3>
              <p className="text-xs text-gray-500 mb-4">Suma de todas las consultoras</p>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{formatCurrency(totalVentasGrupo)}</p>
                  <p className="text-xs text-gray-500">Producción total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-500">{formatCurrency(totalMetaGrupo)}</p>
                  <p className="text-xs text-gray-500">Meta total</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold" style={{ color: getBarColor(pctGrupo) }}>
                    {formatPercent(pctGrupo)}
                  </p>
                  <p className="text-xs text-gray-500">Cumplimiento</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className="h-3 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(pctGrupo, 100)}%`, backgroundColor: getBarColor(pctGrupo) }}
                />
              </div>
            </div>
          )}

          {/* Metas por consultora */}
          {subordinates.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Metas por consultora</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {[...subordinates]
                  .sort((a, b) => b.achievementPercent - a.achievementPercent)
                  .map((c) => (
                    <div key={c.id} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-pink-600 text-xs font-bold">{c.name.charAt(0)}</span>
                          </div>
                          <span className="font-medium text-gray-800 text-sm">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">{formatCurrency(c.totalSales)} / {formatCurrency(c.targetAmount)}</span>
                          <span className="font-bold w-14 text-right" style={{ color: getBarColor(c.achievementPercent) }}>
                            {formatPercent(c.achievementPercent)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(c.achievementPercent, 100)}%`,
                            backgroundColor: getBarColor(c.achievementPercent),
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
