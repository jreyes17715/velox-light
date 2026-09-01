// ============================================================================
// Card de "Progreso hacia Directora (DEC)" -- compartida entre PerfilPage.tsx
// y el Dashboard general de una DEC (DashboardPage.tsx). Regla vigente desde
// 06-ago-2026: para aprobar produccion se exigen DOS condiciones a la vez --
// cada uno de los 3 meses del programa debe llegar al minimo mensual, Y el
// acumulado de los 3 meses debe llegar a la meta total. Ver calcDIQKPIs en
// backend/src/routes/diq.ts (fuente de verdad de estos numeros).
// ============================================================================

export interface MesProduccion { month: number; year: number; bruta: number; neta: number; cumpleMinimo: boolean; }

export interface DiqKpis {
  consultoras: { total: number; activas: number; meta: number; pct: number };
  produccion: {
    bruta: number; neta: number; meta: number; metaMensual: number; pct: number;
    porMes: MesProduccion[]; mesesCumplidos: number; mesesTotal: number;
    cumpleTodosLosMeses: boolean; cumpleAcumulado: boolean; aprobada: boolean;
  };
  iniciaciones: { total: number; meta: number; pct: number };
}

export interface DiqProgress {
  startDate: string;
  endDate: string;
  diasRestantes: number;
  vencido: boolean;
  kpis: DiqKpis;
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const I = ({ icon, className = '' }: { icon: string; className?: string }) => (
  <i className={`${icon} fa-fw ${className}`} aria-hidden="true" />
);

function DiqBar({ label, current, target, currentLabel }: { label: string; current: number; target: number; currentLabel: string }) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const met = current >= target;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={met ? 'text-green-600 font-semibold' : 'text-gray-500'}>{currentLabel}</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${met ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function DiqProgressCard({ diq }: { diq: DiqProgress }) {
  const { kpis } = diq;
  const produccionAprobada = kpis.produccion.aprobada;
  const consultorasMet     = kpis.consultoras.activas >= kpis.consultoras.meta;
  const todoOk = produccionAprobada && consultorasMet;

  const faltaAcumulado   = Math.max(0, kpis.produccion.meta - kpis.produccion.neta);
  const faltaConsultoras = Math.max(0, kpis.consultoras.meta - kpis.consultoras.activas);

  const riesgo = !todoOk && diq.diasRestantes <= 30;

  return (
    <div className={`rounded-xl border p-5 ${diq.vencido ? 'bg-red-50 border-red-200' : riesgo ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
          <I icon="fa-solid fa-star" className="text-amber-500" />
          Progreso hacia Directora (DEC)
        </h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          diq.vencido ? 'bg-red-100 text-red-700' : todoOk ? 'bg-green-100 text-green-700' : riesgo ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {diq.vencido ? 'Periodo vencido' : `${diq.diasRestantes} dias restantes`}
        </span>
      </div>

      <div className="space-y-4">
        <DiqBar
          label={`Produccion neta acumulada (3 meses, minimo ${fmt(kpis.produccion.metaMensual)}/mes)`}
          current={kpis.produccion.neta}
          target={kpis.produccion.meta}
          currentLabel={`${fmt(kpis.produccion.neta)} / ${fmt(kpis.produccion.meta)}`}
        />

        {/* Desglose mensual -- cada mes debe llegar al minimo por separado */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-gray-400">Cumplimiento por mes</p>
            <span className={`text-[11px] font-semibold ${kpis.produccion.cumpleTodosLosMeses ? 'text-green-600' : 'text-gray-400'}`}>
              {kpis.produccion.mesesCumplidos}/{kpis.produccion.mesesTotal} meses
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {kpis.produccion.porMes.map(m => (
              <div key={`${m.year}-${m.month}`}
                className={`rounded-lg p-2 text-center border ${m.cumpleMinimo ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                <p className="text-[10px] font-semibold text-gray-600">{MONTHS_SHORT[m.month - 1]}</p>
                <p className={`text-[11px] font-bold ${m.cumpleMinimo ? 'text-green-700' : 'text-red-600'}`}>{fmt(m.neta)}</p>
              </div>
            ))}
          </div>
        </div>

        <DiqBar
          label="Consultoras activas"
          current={kpis.consultoras.activas}
          target={kpis.consultoras.meta}
          currentLabel={`${kpis.consultoras.activas} / ${kpis.consultoras.meta}`}
        />
        <DiqBar
          label="Nuevas iniciaciones"
          current={kpis.iniciaciones.total}
          target={kpis.iniciaciones.meta}
          currentLabel={`${kpis.iniciaciones.total} / ${kpis.iniciaciones.meta}`}
        />
      </div>

      {!todoOk && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tus objetivos</p>
          {!kpis.produccion.cumpleTodosLosMeses && (
            <p className="text-xs text-gray-600">
              <I icon="fa-solid fa-circle-exclamation" className="text-amber-500 mr-1" />
              Llegar al minimo de {fmt(kpis.produccion.metaMensual)} en todos los meses del periodo
            </p>
          )}
          {!kpis.produccion.cumpleAcumulado && (
            <p className="text-xs text-gray-600">
              <I icon="fa-solid fa-circle-exclamation" className="text-amber-500 mr-1" />
              {fmt(faltaAcumulado)} en produccion neta acumulada
            </p>
          )}
          {!consultorasMet && (
            <p className="text-xs text-gray-600">
              <I icon="fa-solid fa-circle-exclamation" className="text-amber-500 mr-1" />
              {faltaConsultoras} consultora{faltaConsultoras !== 1 ? 's' : ''} activa{faltaConsultoras !== 1 ? 's' : ''} mas
            </p>
          )}
        </div>
      )}

      {todoOk && (
        <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-green-700 font-medium">
          <I icon="fa-solid fa-circle-check" className="mr-1" />
          Cumple los requisitos minimos para calificar como Directora.
        </p>
      )}
    </div>
  );
}
