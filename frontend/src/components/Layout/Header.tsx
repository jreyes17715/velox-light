import { useAuthStore } from '../../store/authStore';

interface HeaderProps {
  month: number;
  year: number;
  onMonthChange: (month: number, year: number) => void;
  unitName?: string | null;
}

const months = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

export function Header({ month, year, onMonthChange, unitName }: HeaderProps) {
  const { user } = useAuthStore();

  const handlePrev = () => {
    if (month === 1) onMonthChange(12, year - 1);
    else onMonthChange(month - 1, year);
  };

  const handleNext = () => {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    if (month === 12) onMonthChange(1, year + 1);
    else onMonthChange(month + 1, year);
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Dashboard General</h2>
        <p className="text-xs text-gray-500">
          {unitName ? `${unitName} · Resumen de indicadores` : 'Resumen de indicadores clave del negocio'}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Selector de mes */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <button onClick={handlePrev} className="text-gray-400 hover:text-gray-600 font-bold">‹</button>
          <span className="text-sm font-medium text-gray-700 min-w-32 text-center">
            {months[month - 1]} {year}
          </span>
          <button onClick={handleNext} className="text-gray-400 hover:text-gray-600 font-bold">›</button>
        </div>

        {/* User */}
        {user && (
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">{user.name}</p>
            <p className="text-xs text-pink-600 capitalize">{user.role}</p>
          </div>
        )}
      </div>
    </header>
  );
}
