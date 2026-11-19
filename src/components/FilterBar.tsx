import { useId } from 'react';
import { Search, RotateCcw, X } from 'lucide-react';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: Array<{ value: string; label: string }>;
  onReset: () => void;
  placeholder?: string;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  onReset,
  placeholder = 'Buscar por código, SKU, lote o referencia...'
}: FilterBarProps) {
  const searchInputId = useId();
  const statusSelectId = useId();
  const hasFilters = searchQuery.trim() !== '' || statusFilter !== (statusOptions[0]?.value ?? 'ALL');

  return (
    <div className="rtw-filter-bar" role="search" aria-label="Filtros de tabla">
      <div className="rtw-field" style={{ flex: '1 1 260px' }}>
        <label className="rtw-label" htmlFor={searchInputId}>
          Buscar
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: '11px', color: 'var(--rtw-text-muted)', pointerEvents: 'none' }}
          />
          <input
            id={searchInputId}
            type="search"
            className="rtw-input rtw-search-input"
            style={{ width: '100%', paddingLeft: '34px', paddingRight: searchQuery ? '32px' : '12px' }}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              style={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--rtw-text-muted)',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '3px'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="rtw-field" style={{ minWidth: '200px' }}>
        <label className="rtw-label" htmlFor={statusSelectId}>
          Estado
        </label>
        <select
          id={statusSelectId}
          className="rtw-select"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {hasFilters && (
        <button
          type="button"
          className="rtw-btn rtw-btn-outline btn-sm"
          onClick={onReset}
        >
          <RotateCcw size={14} />
          Restablecer
        </button>
      )}
    </div>
  );
}
