export function formatCurrency(amount: number, currency = 'DOP'): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getMonthName(month: number): string {
  return new Intl.DateTimeFormat('es-DO', { month: 'long' }).format(new Date(2024, month - 1));
}
