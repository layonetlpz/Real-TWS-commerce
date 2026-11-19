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

/**
 * Formatea una fecha a DD/MM/YYYY evitando desfase por medianoche UTC en fechas YYYY-MM-DD.
 */
export function formatDateDDMMYYYY(dateInput: Date | string): string {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
      return `${dateOnlyMatch[3]}/${dateOnlyMatch[2]}/${dateOnlyMatch[1]}`;
    }
  }
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Escapa caracteres HTML peligrosos antes de interpolar valores en reportes imprimibles.
 */
export function escapeHtml(raw: unknown): string {
  const str = String(raw ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
