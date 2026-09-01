// Estatus informativo de SAP (U_Status): A1/A2/A3/I1/I2/I3/T1/T2/T3.
// Por ahora es solo informativo (no se usa en ningun calculo) -- ver CLAUDE.md.
// Verde = A* (activa), Naranja = I* (inactiva/en proceso), Rojo = T* (terminada/nueva).
// Corregido 24-ago-2026: el naranja es para I*, no B* (confusion inicial con los
// valores documentados en CLAUDE.md -- Padrino confirmo que en SAP el prefijo
// real es "I", no "B").

// Interruptor temporal (25-ago-2026, a pedido de Padrino): oculta el badge en
// toda la app sin borrar el trabajo ya hecho. Para reactivarlo, poner en true.
// Se exporta para que las tablas que agregaron una columna "Estatus" tambien
// puedan ocultar esa columna (encabezado incluido) mientras esto este apagado.
export const STATUS_BADGE_ENABLED = false;
const ENABLED = STATUS_BADGE_ENABLED;

interface StatusBadgeProps {
  status?: string | null;
  variant?: 'tag' | 'bubble';
  className?: string;
}

function getStyle(status: string) {
  const prefix = status.charAt(0).toUpperCase();
  if (prefix === 'A') return { bg: 'bg-green-100', text: 'text-green-700', ring: 'ring-green-200', dot: 'bg-green-500' };
  if (prefix === 'I') return { bg: 'bg-orange-100', text: 'text-orange-700', ring: 'ring-orange-200', dot: 'bg-orange-500' };
  if (prefix === 'T') return { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', dot: 'bg-red-500' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', ring: 'ring-gray-200', dot: 'bg-gray-400' };
}

export function StatusBadge({ status, variant = 'tag', className = '' }: StatusBadgeProps) {
  if (!ENABLED || !status) return null;
  const s = getStyle(status);

  if (variant === 'bubble') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text} ring-1 ${s.ring} ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
        Estatus {status}
      </span>
    );
  }

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg} ${s.text} ${className}`}>
      {status}
    </span>
  );
}
