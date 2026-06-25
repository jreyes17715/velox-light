import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { Header } from '../components/Layout/Header';
import { OverviewCard } from '../components/Dashboard/OverviewCard';
import { SalesChart } from '../components/Dashboard/SalesChart';
import { GoalThermometer } from '../components/Dashboard/GoalThermometer';
import { ProductionChart } from '../components/Dashboard/ProductionChart';
import { SubordinatesTable } from '../components/Dashboard/SubordinatesTable';
import { LoadingSpinner } from '../components/Common/LoadingSpinner';
import { ErrorAlert } from '../components/Common/ErrorAlert';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import { OverviewData, SubordinateData, Sale, PaginatedResponse } from '../types';
import { formatCurrency, formatPercent } from '../utils/formatters';

export function DashboardPage() {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [subordinates, setSubordinates] = useState<SubordinateData[]>([]);
  const [chartData, setChartData] = useState<{ date: string; amount: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    fetchDashboard();
  }, [month, year]);

  const fetchDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewRes, subordinatesRes, salesRes] = await Promise.all([
        api.get<OverviewData>(`/dashboard/overview?month=${month}&year=${year}`),
        api.get<{ data: SubordinateData[] }>(`/dashboard/subordinates?month=${month}&year=${year}&limit=50`),
        api.get<PaginatedResponse<Sale>>(`/sales?limit=200`),
      ]);

      setOverview(overviewRes.data);
      setSubordinates(subordinatesRes.data.data);

      // Preparar datos del gráfico (últimos 30 días)
      const salesByDate: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        salesByDate[d.toISOString().slice(0, 10)] = 0;
      }
      salesRes.data.data.forEach((s) => {
        const key = s.saleDate.slice(0, 10);
        if (key in salesByDate) salesByDate[key] += s.amount;
      });
      setChartData(Object.entries(salesByDate).map(([date, amount]) => ({ date, amount })));
    } catch {
      setError('Error cargando el dashboard. Verifica que el backend esté corriendo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
  };

  // Sincronizar user en store si vino del overview
  const role = user?.role || overview?.user.role;

  if (isLoading) return <LoadingSpinner message="Cargando dashboard..." />;

  return (
    <Layout>
      <div className="flex flex-col min-h-screen">
        <Header month={month} year={year} onMonthChange={handleMonthChange} unitName={overview?.user.unitName} />

        <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
          {error && <ErrorAlert message={error} />}

          {/* KPI Cards */}
          {overview && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <OverviewCard
                title="Ventas del Mes"
                value={formatCurrency(overview.totalSales)}
                subtitle={`Meta: ${formatCurrency(overview.targetAmount)}`}
                iconBg="bg-pink-100"
                icon="💄"
              />
              <OverviewCard
                title="% Cumplimiento"
                value={formatPercent(overview.achievementPercent)}
                subtitle={overview.achievementPercent >= 100 ? '¡Meta alcanzada!' : 'En progreso'}
                change={overview.achievementPercent >= 100
                  ? { value: 'Meta superada', positive: true }
                  : undefined}
                iconBg="bg-purple-100"
                icon="🎯"
              />
              <OverviewCard
                title="Pedidos del Mes"
                value={`${overview.salesCount}`}
                iconBg="bg-blue-100"
                icon="📦"
              />
              <OverviewCard
                title="Mis Consultoras"
                value={`${overview.subordinateCount}`}
                subtitle={user?.role === 'directora' ? 'en tu unidad' : '—'}
                iconBg="bg-orange-100"
                icon="👥"
              />
            </div>
          )}

          {/* Gráfico de línea + Termómetro */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesChart data={chartData} />
            </div>
            {overview && (
              <GoalThermometer
                totalSales={overview.totalSales}
                targetAmount={overview.targetAmount}
                achievementPercent={overview.achievementPercent}
              />
            )}
          </div>

          {/* Producción por consultora (solo directoras) */}
          {role === 'directora' && subordinates.length > 0 && (
            <ProductionChart data={subordinates} />
          )}

          {/* Tabla consultoras */}
          {role === 'directora' && (
            <SubordinatesTable data={subordinates} unitName={overview?.user.unitName} />
          )}
        </div>
      </div>
    </Layout>
  );
}
