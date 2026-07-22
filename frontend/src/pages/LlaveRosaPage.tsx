import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout/Layout';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// ============================================================================
// LLAVE ROSA -- datos de PRODUCCION simulados (fake) que vienen del backend
// (backend/src/routes/llaveRosa.ts), pero con la estructura de negocio real
// (Niveles A/B, metas mensual/trimestral/semestral, fase de calificacion vs
// mantenimiento). Pendiente conectar la produccion real y definir varias
// reglas -- ver comentarios en llaveRosa.ts.
// ============================================================================

type Nivel = 'A' | 'B';
type Fase = 'calificacion' | 'mantenimiento';
type MantenimientoStatus = 'al_dia' | 'en_riesgo' | 'incumplida' | 'no_aplica';
type Badge = 'en_progreso' | 'en_riesgo' | 'incumplida' | 'alcanzada' | 'manteniendo';

interface MetaBloque { meta: number; actual: number; pct: number; }

interface LlaveRosaStatus {
  sapUserId: string;
  name: string;
  unitName: string | null;
  nivel: Nivel;
  vehiculo: string;
  fase: Fase;
  quarterLabel: string;
  semestreLabel: string;
  proximaEvaluacion: string;
  diasRestantesMes: number;
  metas: { mensual: MetaBloque; trimestral: MetaBloque; semestral: MetaBloque | null };
  racha: number;
  premio: { tipo: 'auto' | 'efectivo' | null; label: string; definidoPorAdmin: boolean };
  mantenimiento: { status: MantenimientoStatus; proximaEvaluacion: string; montoFaltanteTrimestral: number };
  historicoMensual: { mes: string; ventaNetaMes: number; ventaNetaAcumulada: number }[];
  badge: Badge;
}

interface RankingResponse {
  quarterLabel: string;
  totalDirectoras: number;
  nivelA: number;
  nivelB: number;
  enCalificacion: number;
  enMantenimiento: number;
  alcanzadas: number;
  enRiesgo: number;
  directoras: LlaveRosaStatus[];
}

interface LlaveRosaConfig {
  carImageA: string | null;
  carImageB: string | null;
  vehicleNameA: string;
  vehicleNameB: string;
  premioPreferencias: Record<string, 'auto' | 'efectivo'>;
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(n);
}

const STATUS_META: Record<Badge, { label: string; color: string; bg: string; icon: string }> = {
  en_progreso: { label: 'En progreso',       color: 'text-gray-600',    bg: 'bg-gray-100',    icon: 'fa-solid fa-arrow-trend-up' },
  en_riesgo:   { label: 'En riesgo',         color: 'text-amber-700',   bg: 'bg-amber-100',   icon: 'fa-solid fa-triangle-exclamation' },
  incumplida:  { label: 'Incumplida',        color: 'text-red-700',     bg: 'bg-red-100',     icon: 'fa-solid fa-circle-xmark' },
  alcanzada:   { label: 'Meta alcanzada',    color: 'text-emerald-700', bg: 'bg-emerald-100', icon: 'fa-solid fa-key' },
  manteniendo: { label: 'Manteniendo racha', color: 'text-rose-700',    bg: 'bg-rose-100',    icon: 'fa-solid fa-medal' },
};

const MANTENIMIENTO_META: Record<MantenimientoStatus, { label: string; color: string; bg: string; icon: string }> = {
  al_dia:     { label: 'Al dia',      color: 'text-emerald-700', bg: 'bg-emerald-50', icon: 'fa-solid fa-shield-check' },
  en_riesgo:  { label: 'En riesgo',   color: 'text-amber-700',   bg: 'bg-amber-50',   icon: 'fa-solid fa-shield-halved' },
  incumplida: { label: 'Incumplida',  color: 'text-red-700',     bg: 'bg-red-50',     icon: 'fa-solid fa-shield-xmark' },
  no_aplica:  { label: 'No aplica aun', color: 'text-gray-500',  bg: 'bg-gray-50',    icon: 'fa-solid fa-shield' },
};

// ─── Auto ilustrado (fallback cuando no hay foto real cargada) ─────────────
function CarGauge({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const topY = 60;
  const bottomY = 130;
  const fillY = bottomY - (clamped / 100) * (bottomY - topY);
  const CAR_PATH =
    'M30 130 L40 100 Q50 80 75 78 L100 78 Q112 62 135 60 L175 60 Q195 60 205 78 L235 80 Q255 82 258 100 L258 130 Z';
  return (
    <svg viewBox="0 0 280 175" className="w-full max-w-sm mx-auto" role="img" aria-label={`Avance ${Math.round(percent)}%`}>
      <defs>
        <linearGradient id="llaveRosaFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#db2777" />
          <stop offset="100%" stopColor="#f9a8d4" />
        </linearGradient>
        <clipPath id="llaveRosaCarClip"><path d={CAR_PATH} /></clipPath>
      </defs>
      <path d={CAR_PATH} fill="#fdf2f8" stroke="#db2777" strokeWidth="2.5" />
      <g clipPath="url(#llaveRosaCarClip)">
        <rect x="20" y={fillY} width="250" height="120" fill="url(#llaveRosaFill)" style={{ transition: 'y 0.9s ease' }} />
        <rect x="20" y={fillY} width="250" height="2.5" fill="#fff" opacity="0.7" style={{ transition: 'y 0.9s ease' }} />
      </g>
      <path d={CAR_PATH} fill="none" stroke="#831843" strokeWidth="2.5" />
      <path d="M103 78 L112 63 L133 61 L133 78 Z" fill="#ffffff" opacity="0.55" />
      <path d="M138 61 L173 61 Q188 61 197 78 L138 78 Z" fill="#ffffff" opacity="0.55" />
      <circle cx="80" cy="132" r="16" fill="#4c0519" /><circle cx="80" cy="132" r="6.5" fill="#fbcfe8" />
      <circle cx="210" cy="132" r="16" fill="#4c0519" /><circle cx="210" cy="132" r="6.5" fill="#fbcfe8" />
      <line x1="8" y1="149" x2="272" y2="149" stroke="#f9a8d4" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function ProgressBar({ percent, thick = false }: { percent: number; thick?: boolean }) {
  const clamped = Math.min(percent, 100);
  const color = percent >= 100 ? 'bg-emerald-500' : percent >= 80 ? 'bg-rose-500' : percent >= 40 ? 'bg-pink-400' : 'bg-gray-300';
  return (
    <div className={`${thick ? 'h-3' : 'h-2'} bg-gray-100 rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

const I = ({ icon, className = '' }: { icon: string; className?: string }) => (
  <i className={`${icon} fa-fw ${className}`} aria-hidden="true" />
);

// ─── Card de una meta (mensual/trimestral/semestral) ───────────────────────
function MetaCard({ label, icon, data, extra, highlight }: {
  label: string; icon: string; data: MetaBloque; extra: string; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-center gap-2 mb-1">
        <I icon={`fa-solid ${icon}`} className={highlight ? 'text-rose-500' : 'text-gray-400'} />
        <p className={`text-xs font-semibold ${highlight ? 'text-rose-700' : 'text-gray-500'}`}>{label}</p>
      </div>
      <p className={`text-lg font-bold ${highlight ? 'text-rose-800' : 'text-gray-900'}`}>{fmt(data.meta)}</p>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1"><ProgressBar percent={data.pct} /></div>
        <span className="text-xs font-semibold text-gray-600 w-10 text-right">{data.pct}%</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">Actual: {fmt(data.actual)}</p>
      <p className="text-xs text-gray-400">{extra}</p>
    </div>
  );
}

// ─── Aviso de version beta ──────────────────────────────────────────────────
function BetaBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
      <I icon="fa-solid fa-flask" className="text-[10px]" />Versión Beta
    </div>
  );
}

// ─── Modal de celebracion: "te ganaste el auto" ────────────────────────────
function CarWonModal({ nombre, vehiculo, carImage, premio, onClose }: {
  nombre: string; vehiculo: string; carImage?: string | null;
  premio: { tipo: 'auto' | 'efectivo' | null; label: string } | null;
  onClose: () => void;
}) {
  const confettiColors = ['#ec4899', '#f472b6', '#fbcfe8', '#facc15', '#34d399', '#60a5fa', '#a78bfa'];
  const [pieces] = useState(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1,
      duration: 2.4 + Math.random() * 1.6,
      color: confettiColors[i % confettiColors.length],
      rotate: Math.round(Math.random() * 360),
      size: 6 + Math.random() * 7,
    }))
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <style>{`
        @keyframes llaveRosaFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes llaveRosaPopIn { 0% { opacity: 0; transform: scale(0.75) translateY(20px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes llaveRosaConfetti { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(600deg); opacity: 0.9; } }
        @keyframes llaveRosaTrophyBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>

      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" style={{ animation: 'llaveRosaFadeIn 0.25s ease' }} onClick={onClose} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {pieces.map((p, i) => (
          <span key={i} style={{
            position: 'absolute', top: '-8%', left: `${p.left}%`, width: p.size, height: p.size * 0.45,
            backgroundColor: p.color, borderRadius: 2,
            animation: `llaveRosaConfetti ${p.duration}s ease-in ${p.delay}s forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }} />
        ))}
      </div>

      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center"
        style={{ animation: 'llaveRosaPopIn 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 transition-colors">
          <I icon="fa-solid fa-xmark" />
        </button>

        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 mx-auto flex items-center justify-center shadow-lg shadow-rose-200 mb-4"
          style={{ animation: 'llaveRosaTrophyBounce 1.1s ease-in-out infinite' }}>
          <I icon="fa-solid fa-trophy" className="text-3xl text-white" />
        </div>

        <p className="text-xs font-bold text-rose-500 uppercase tracking-wide mb-1">¡Felicidades!</p>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Te ganaste tu Llave Rosa</h2>

        {carImage
          ? <img src={carImage} alt={vehiculo} className="max-h-32 mx-auto object-contain mb-3" />
          : <I icon="fa-solid fa-car-side" className="text-5xl text-rose-300 mb-3 block" />}

        <p className="text-sm text-gray-500 mb-4">
          {nombre}, alcanzaste tu meta de producción y te ganaste el derecho de uso de tu <span className="font-bold text-rose-600">{vehiculo}</span>.
        </p>

        {premio?.tipo && (
          <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-700 mb-4">
            Tu premio: {premio.label}
          </div>
        )}

        <button onClick={onClose} className="w-full bg-gradient-to-r from-rose-500 to-pink-500 text-white font-bold rounded-xl py-3 hover:opacity-90 transition-opacity">
          ¡Genial!
        </button>
      </div>
    </div>
  );
}

// ─── Vista Directora ────────────────────────────────────────────────────────
function MiLlaveRosa() {
  const [data, setData]     = useState<LlaveRosaStatus | null>(null);
  const [config, setConfig] = useState<LlaveRosaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'acumulado' | 'mensual'>('acumulado');
  const [showWonModal, setShowWonModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, cfgRes] = await Promise.all([
          api.get<LlaveRosaStatus>('/llaverosa/me'),
          api.get<LlaveRosaConfig>('/llaverosa/config'),
        ]);
        setData(meRes.data);
        setConfig(cfgRes.data);

        const trimestral = meRes.data.metas.trimestral;
        if (trimestral.actual >= trimestral.meta) {
          // Solo se muestra automaticamente una vez por trimestre por directora
          // (se guarda en localStorage). El boton "Ver mi logro" la deja reabrir
          // cuando quiera.
          const key = `llaveRosa_won_${meRes.data.sapUserId}_${meRes.data.quarterLabel}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, '1');
            setShowWonModal(true);
          }
        }
      } catch {
        setError('No se pudo cargar tu avance de Llave Rosa.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-center py-20 text-gray-400"><I icon="fa-solid fa-spinner fa-spin" className="text-2xl" /></div>;
  if (error || !data) return <div className="text-center py-20 text-gray-400">{error ?? 'Sin datos disponibles.'}</div>;

  const meta = STATUS_META[data.badge];
  const mant = MANTENIMIENTO_META[data.mantenimiento.status];
  const trimestral = data.metas.trimestral;
  const metaAlcanzadaTrimestre = trimestral.actual >= trimestral.meta;
  const carImage = data.nivel === 'A' ? config?.carImageA : config?.carImageB;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <BetaBadge />
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <I icon="fa-solid fa-key" className="text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Llave Rosa</h1>
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              {data.quarterLabel}
              <I icon="fa-solid fa-circle-info" className="text-gray-300 text-xs" />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {metaAlcanzadaTrimestre && (
            <button onClick={() => setShowWonModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm hover:opacity-90 transition-opacity">
              <I icon="fa-solid fa-trophy" />Ver mi logro
            </button>
          )}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm ${meta.bg} ${meta.color}`}>
            <I icon={meta.icon} />{meta.label}
          </span>
          <button className="w-9 h-9 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600">
            <I icon="fa-regular fa-bell" />
          </button>
          <button className="w-9 h-9 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600">
            <I icon="fa-regular fa-circle-question" />
          </button>
        </div>
      </div>

      {showWonModal && (
        <CarWonModal
          nombre={data.name.split(' ')[0]}
          vehiculo={data.vehiculo}
          carImage={carImage}
          premio={data.premio}
          onClose={() => setShowWonModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Card principal: auto + avance trimestral */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-pink-100/70 shadow-md p-6 sm:p-8 flex flex-col">
          {metaAlcanzadaTrimestre ? (
            <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2 mb-4 self-start">
              <I icon="fa-solid fa-circle-check" />Ya alcanzaste la meta de producción de este trimestre.
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-100 text-gray-500 text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-2 mb-4 self-start">
              <I icon="fa-solid fa-circle-info" />Sigue produciendo para alcanzar tu meta de este trimestre.
            </div>
          )}

          {carImage ? (
            <img src={carImage} alt={data.vehiculo} className="max-h-52 mx-auto object-contain" />
          ) : (
            <CarGauge percent={trimestral.pct} />
          )}

          <div className="mt-4 text-center">
            <p className="text-4xl font-extrabold text-rose-600">{Math.min(trimestral.pct, 999)}%</p>
            <p className="text-sm text-gray-500 mt-1">{fmt(trimestral.actual)} de {fmt(trimestral.meta)} en producción</p>
          </div>

          <div className="mt-5"><ProgressBar percent={trimestral.pct} thick /></div>
        </div>

        {/* Tus Metas */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tus Metas</p>
          <div className="space-y-3">
            <MetaCard label="Meta mensual" icon="fa-calendar-day" data={data.metas.mensual}
              extra={`Quedan ${data.diasRestantesMes} ${data.diasRestantesMes === 1 ? 'dia' : 'dias'}`} />
            <MetaCard label="Meta trimestral" icon="fa-calendar-days" data={data.metas.trimestral}
              extra={`Periodo: ${data.quarterLabel.replace(/^Q\d\s\d{4}\s\(/, '').replace(')', '')} ${data.quarterLabel.match(/\d{4}/)?.[0] ?? ''}`}
              highlight />
            {data.metas.semestral && (
              <MetaCard label="Meta semestral" icon="fa-calendar" data={data.metas.semestral} extra={`Periodo: ${data.semestreLabel}`} />
            )}
          </div>
        </div>
      </div>

      {/* Racha / Premio / Mantenimiento / Proxima Evaluacion / Monto Faltante + Premios por nivel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center mb-2"><I icon="fa-solid fa-fire" className="text-rose-500" /></div>
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Racha</p>
            <p className="text-sm font-bold text-gray-900">{data.racha} {data.racha === 1 ? 'trimestre' : 'trimestres'} consecutivos</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">{data.racha > 0 ? '¡Sigue asi!' : 'Aun sin racha'}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className="w-9 h-9 rounded-lg bg-pink-50 flex items-center justify-center mb-2">
              <I icon={`fa-solid ${data.premio.tipo === 'auto' ? 'fa-car-side' : data.premio.tipo === 'efectivo' ? 'fa-sack-dollar' : 'fa-hourglass-half'}`} className="text-pink-500" />
            </div>
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Premio</p>
            <p className="text-sm font-bold text-gray-900">{data.premio.label}</p>
            {data.premio.tipo && (
              <div className="flex rounded-lg bg-gray-100 p-0.5 mt-2 text-[10px] font-semibold">
                <div className={`flex-1 text-center rounded-md py-1 transition-colors ${data.premio.tipo === 'auto' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-400'}`}>Auto</div>
                <div className={`flex-1 text-center rounded-md py-1 transition-colors ${data.premio.tipo === 'efectivo' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-400'}`}>Efectivo</div>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1.5">
              {data.premio.definidoPorAdmin ? 'Definido por Super Admin' : data.premio.tipo ? 'Ejemplo, pendiente de definir' : (data.fase === 'mantenimiento' ? '' : 'Sigue produciendo')}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className={`w-9 h-9 rounded-lg ${mant.bg} flex items-center justify-center mb-2`}><I icon={mant.icon} className={mant.color} /></div>
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Mantenimiento</p>
            <p className={`text-sm font-bold ${mant.color}`}>{mant.label}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {data.mantenimiento.status === 'no_aplica' ? 'Aplica al pasar a mantenimiento' : (
                <a href="#reglas-mantenimiento" className="text-rose-600 hover:text-rose-700 font-medium">Ver detalles <I icon="fa-solid fa-arrow-right" className="text-[9px]" /></a>
              )}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-2"><I icon="fa-solid fa-calendar-check" className="text-blue-500" /></div>
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Próxima evaluación</p>
            <p className="text-sm font-bold text-gray-900">{data.proximaEvaluacion}</p>
            <p className="text-[11px] text-gray-400 mt-1">Inicio del próximo trimestre</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center mb-2"><I icon="fa-solid fa-bullseye" className="text-purple-500" /></div>
            <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Monto faltante</p>
            <p className="text-sm font-bold text-gray-900">{fmt(data.mantenimiento.montoFaltanteTrimestral)}</p>
            <p className="text-[11px] text-gray-400 mt-1">{data.mantenimiento.montoFaltanteTrimestral === 0 ? '¡Meta superada!' : 'para meta trimestral'}</p>
          </div>
        </div>

        {/* Premios por nivel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
          <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Premios por Nivel</p>
          <p className="text-[11px] text-gray-400 mb-3">Alcanza y mantén tus metas para ganar tu auto.</p>
          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as Nivel[]).map(n => {
              const img = n === 'A' ? config?.carImageA : config?.carImageB;
              const nombre = n === 'A' ? (config?.vehicleNameA ?? 'Tiggo 4') : (config?.vehicleNameB ?? 'Tiggo 7');
              const cfgN = n === data.nivel ? data : null;
              return (
                <div key={n} className={`rounded-xl border p-3 text-center ${n === data.nivel ? 'border-rose-300 bg-rose-50' : 'border-gray-100'}`}>
                  <p className={`text-xs font-bold ${n === data.nivel ? 'text-rose-700' : 'text-gray-600'}`}>Meta {n}</p>
                  <p className={`text-[11px] font-semibold mb-1 ${n === data.nivel ? 'text-rose-500' : 'text-gray-400'}`}>{nombre}</p>
                  {img
                    ? <img src={img} alt={nombre} className="w-full h-16 object-contain my-1" />
                    : <div className="w-full h-14 flex items-center justify-center text-gray-300 my-1"><I icon="fa-solid fa-car-side" className="text-3xl" /></div>}
                  {cfgN ? (
                    <p className="text-[10px] text-gray-500 leading-tight">{fmt(cfgN.metas.mensual.meta)} mensual<br />{fmt(cfgN.metas.trimestral.meta)} trimestral</p>
                  ) : (
                    <p className="text-[11px] text-gray-400">Otro nivel</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Historico + reglas de mantenimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-md p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Histórico de Venta Neta</p>
            <select value={chartMode} onChange={e => setChartMode(e.target.value as 'acumulado' | 'mensual')}
              className="border border-gray-200 rounded-lg text-xs px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-200">
              <option value="acumulado">Acumulado</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.historicoMensual} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}K`} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Line type="monotone" dataKey={chartMode === 'acumulado' ? 'ventaNetaAcumulada' : 'ventaNetaMes'}
                name={chartMode === 'acumulado' ? 'Venta neta acumulada (RD$)' : 'Venta neta del mes (RD$)'}
                stroke="#db2777" strokeWidth={2.5} dot={{ r: 3, fill: '#db2777' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div id="reglas-mantenimiento" className="bg-white rounded-2xl border border-gray-100 shadow-md p-5 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Reglas de Mantenimiento <span className="text-gray-400 font-normal normal-case">(Después del mes 6)</span></p>
          <p className="text-[11px] text-gray-400">Para mantener tu derecho de uso del auto, debes cumplir con las metas de mantenimiento cada mes y trimestre.</p>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="text-gray-400 text-left">
                <th className="pb-1.5 font-medium"></th>
                <th className="pb-1.5 font-medium text-right">Meta A ({config?.vehicleNameA ?? 'Tiggo 4'})</th>
                <th className="pb-1.5 font-medium text-right">Meta B ({config?.vehicleNameB ?? 'Tiggo 7'})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr>
                <td className="py-2 text-gray-500 flex items-center gap-1.5"><I icon="fa-solid fa-calendar-day" className="text-gray-300" />Meta mensual</td>
                <td className="py-2 text-right font-semibold text-gray-800">{fmt(900_000)}</td>
                <td className="py-2 text-right font-semibold text-gray-800">{fmt(1_300_000)}</td>
              </tr>
              <tr>
                <td className="py-2 text-gray-500 flex items-center gap-1.5"><I icon="fa-solid fa-calendar-days" className="text-gray-300" />Meta trimestral</td>
                <td className="py-2 text-right font-semibold text-gray-800">{fmt(2_700_000)}</td>
                <td className="py-2 text-right font-semibold text-gray-800">{fmt(3_900_000)}</td>
              </tr>
            </tbody>
          </table>

          {(data.mantenimiento.status === 'en_riesgo' || data.mantenimiento.status === 'incumplida') && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                  <I icon="fa-solid fa-triangle-exclamation" />¡Atención! En riesgo de perder mantenimiento
                </p>
                <p className="text-[11px] text-amber-600 mt-1">
                  Si no cumples con las metas de mantenimiento en este trimestre ({data.quarterLabel.split(' ')[0]}), puedes perder el derecho de uso del auto en el próximo trimestre.
                </p>
              </div>
              <button className="flex-shrink-0 rounded-full border border-amber-300 text-amber-700 text-[11px] font-semibold px-3.5 py-1.5 hover:bg-amber-100 transition-colors whitespace-nowrap">
                Ver detalle de mantenimiento
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Los datos mostrados son de carácter referencial y pueden variar. Consulta el reglamento oficial de Llave Rosa para más información.
      </p>
    </div>
  );
}

// ─── Panel Super Admin: fotos reales de los vehiculos ──────────────────────
function VehiculoUploadBox({ nivel, label, image, name, onSave }: {
  nivel: Nivel; label: string; image: string | null; name: string;
  onSave: (img: string | null, name: string) => Promise<void>;
}) {
  const [nameInput, setNameInput] = useState(name);
  const [saving, setSaving]       = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      setSaving(true);
      try { await onSave(reader.result as string, nameInput); } finally { setSaving(false); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Foto real — Nivel {nivel}</p>
      <div className="h-32 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center mb-3 overflow-hidden">
        {image ? <img src={image} alt={label} className="max-h-full max-w-full object-contain" /> : <I icon="fa-solid fa-car-side" className="text-3xl text-gray-300" />}
      </div>
      <div className="flex gap-2">
        <input
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={() => onSave(image, nameInput)}
          className="flex-1 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200"
          placeholder="Nombre del vehiculo"
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
        >
          {saving ? <I icon="fa-solid fa-spinner fa-spin" /> : <I icon="fa-solid fa-upload" />} Subir foto
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ─── Vista Super Admin: ranking de directoras ──────────────────────────────
function LlaveRosaRanking() {
  const [data, setData]     = useState<RankingResponse | null>(null);
  const [config, setConfig] = useState<LlaveRosaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  const load = async () => {
    try {
      const [rankRes, cfgRes] = await Promise.all([
        api.get<RankingResponse>('/llaverosa/ranking'),
        api.get<LlaveRosaConfig>('/llaverosa/config'),
      ]);
      setData(rankRes.data);
      setConfig(cfgRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const [savingPremio, setSavingPremio] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen]   = useState(false);

  const saveConfig = async (nivel: Nivel, img: string | null, name: string) => {
    const body = nivel === 'A' ? { carImageA: img, vehicleNameA: name } : { carImageB: img, vehicleNameB: name };
    const { data: updated } = await api.put<LlaveRosaConfig>('/llaverosa/config', body);
    setConfig(updated);
  };

  const setPremio = async (sapUserId: string, tipo: 'auto' | 'efectivo') => {
    setSavingPremio(sapUserId);
    try {
      const { data: updated } = await api.put<LlaveRosaConfig>(`/llaverosa/premio/${sapUserId}`, { tipo });
      setConfig(updated);
      setData(prev => prev ? {
        ...prev,
        directoras: prev.directoras.map(d => d.sapUserId === sapUserId
          ? { ...d, premio: { ...d.premio, tipo, definidoPorAdmin: true, label: tipo === 'auto' ? `Derecho de llave (${d.vehiculo})` : 'Equivalente en efectivo' } }
          : d),
      } : prev);
    } finally {
      setSavingPremio(null);
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400"><I icon="fa-solid fa-spinner fa-spin" className="text-2xl" /></div>;
  if (!data) return <div className="text-center py-20 text-gray-400">Sin datos disponibles.</div>;

  const filtered = data.directoras.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.unitName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <BetaBadge />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
            <I icon="fa-solid fa-key" className="text-rose-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Llave Rosa</h1>
            <p className="text-xs text-gray-500">{data.quarterLabel} — Nivel A: {fmt(2_850_000)}/trim. · Nivel B: {fmt(4_050_000)}/trim.</p>
          </div>
        </div>
        <button onClick={() => setPreviewOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-gray-200 shadow-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <I icon="fa-solid fa-eye" />Vista previa: modal de premio
        </button>
      </div>

      {previewOpen && (
        <CarWonModal
          nombre="Directora Ejemplo"
          vehiculo={config?.vehicleNameA ?? 'Tiggo 4'}
          carImage={config?.carImageA}
          premio={{ tipo: 'auto', label: `Derecho de llave (${config?.vehicleNameA ?? 'Tiggo 4'})` }}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Fotos reales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <VehiculoUploadBox nivel="A" label="Nivel A" image={config?.carImageA ?? null} name={config?.vehicleNameA ?? 'Tiggo 4'}
          onSave={(img, name) => saveConfig('A', img, name)} />
        <VehiculoUploadBox nivel="B" label="Nivel B" image={config?.carImageB ?? null} name={config?.vehicleNameB ?? 'Tiggo 7'}
          onSave={(img, name) => saveConfig('B', img, name)} />
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total directoras', value: data.totalDirectoras, color: 'text-gray-900', icon: 'fa-solid fa-users', chip: 'bg-gray-100 text-gray-500' },
          { label: 'Nivel A', value: data.nivelA, color: 'text-gray-900', icon: 'fa-solid fa-car-side', chip: 'bg-rose-50 text-rose-500' },
          { label: 'Nivel B', value: data.nivelB, color: 'text-gray-900', icon: 'fa-solid fa-car-side', chip: 'bg-pink-50 text-pink-500' },
          { label: 'En calificación', value: data.enCalificacion, color: 'text-blue-600', icon: 'fa-solid fa-hourglass-half', chip: 'bg-blue-50 text-blue-500' },
          { label: 'En mantenimiento', value: data.enMantenimiento, color: 'text-emerald-600', icon: 'fa-solid fa-shield-check', chip: 'bg-emerald-50 text-emerald-500' },
          { label: 'En riesgo', value: data.enRiesgo, color: 'text-amber-600', icon: 'fa-solid fa-triangle-exclamation', chip: 'bg-amber-50 text-amber-500' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-md p-4">
            <div className={`w-8 h-8 rounded-lg ${s.chip} flex items-center justify-center mb-2`}><I icon={s.icon} className="text-sm" /></div>
            <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wide">{s.label}</p>
            <p className={`text-xl font-extrabold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar directora o unidad..."
          className="w-full sm:w-80 border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 shadow-sm"
        />
        <I icon="fa-solid fa-magnifying-glass" className="absolute right-3 top-3 text-gray-400 text-sm" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-center w-10">#</th>
                <th className="px-4 py-3 text-left">Directora</th>
                <th className="px-4 py-3 text-left">Unidad</th>
                <th className="px-4 py-3 text-center">Nivel</th>
                <th className="px-4 py-3 text-center">Fase</th>
                <th className="px-4 py-3 text-left w-44">Avance trimestral</th>
                <th className="px-4 py-3 text-right">Producción</th>
                <th className="px-4 py-3 text-center">Racha</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Premio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((d, i) => {
                const meta = STATUS_META[d.badge];
                const puedeElegirPremio = d.fase === 'mantenimiento';
                return (
                  <tr key={d.sapUserId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{d.unitName ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">{d.nivel} · {d.vehiculo}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 capitalize">{d.fase === 'calificacion' ? 'Calificación' : 'Mantenimiento'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1"><ProgressBar percent={d.metas.trimestral.pct} /></div>
                        <span className="text-xs font-semibold text-gray-600 w-10 text-right">{Math.min(d.metas.trimestral.pct, 999)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(d.metas.trimestral.actual)}</td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      <I icon="fa-solid fa-fire" className="text-rose-400 mr-1" />{d.racha}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.bg} ${meta.color}`}>
                        <I icon={meta.icon} />{meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {puedeElegirPremio ? (
                        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold">
                          <button disabled={savingPremio === d.sapUserId} onClick={() => setPremio(d.sapUserId, 'auto')}
                            className={`px-2.5 py-1 rounded-md transition-colors ${d.premio.tipo === 'auto' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            Auto
                          </button>
                          <button disabled={savingPremio === d.sapUserId} onClick={() => setPremio(d.sapUserId, 'efectivo')}
                            className={`px-2.5 py-1 rounded-md transition-colors ${d.premio.tipo === 'efectivo' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            Efectivo
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Sin resultados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-start gap-3">
        <I icon="fa-solid fa-circle-info" className="text-rose-400 mt-0.5" />
        <p className="text-xs text-rose-700 leading-relaxed">
          La producción mostrada es real (viene de las ventas sincronizadas de SAP). El Nivel (A/B) y la Fase (Calificación/Mantenimiento)
          se infieren automáticamente del historial de ventas mientras no exista un flujo de inscripción administrativa. El Premio
          (Auto/Efectivo) solo se puede editar aquí una vez la directora entra en fase de Mantenimiento.
        </p>
      </div>
    </div>
  );
}

export default function LlaveRosaPage() {
  const { user } = useAuthStore();

  return (
    <Layout>
      <div className="p-4 sm:p-6">
        {user?.isSuperAdmin ? (
          <LlaveRosaRanking />
        ) : user?.role === 'directora' ? (
          <MiLlaveRosa />
        ) : (
          <div className="text-center py-20 text-gray-400">
            <I icon="fa-solid fa-lock" className="text-3xl mb-3 block" />
            Llave Rosa es exclusivo para Directoras.
          </div>
        )}
      </div>
    </Layout>
  );
}
