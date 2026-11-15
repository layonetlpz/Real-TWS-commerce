const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const integerFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

export function formatCOP(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'PENDIENTE DE INFORMACIÓN';
  }
  return `${copFormatter.format(value)} COP`;
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return integerFormatter.format(value);
}

export function formatDateDDMMYYYY(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
