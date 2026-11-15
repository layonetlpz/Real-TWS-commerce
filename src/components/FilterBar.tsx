import { Search, RotateCcw } from 'lucide-react';

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
  return (
    <div className="rtw-filter-bar" role="search" aria-label="Filtros de tabla">
      <div className="rtw-field" style={{ flex: '1 1 260px' }}>
        <label className="rtw-label" htmlFor="table-search-input">
          Búsqueda Rápida
        </label>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: '10px', color: '#64748b' }}
          />
          <input
            id="table-search-input"
            type="search"
            className="rtw-input"
            style={{ width: '100%', paddingLeft: '32px' }}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
          />
        </div>
      </div>

      <div className="rtw-field" style={{ minWidth: '200px' }}>
        <label className="rtw-label" htmlFor="table-status-select">
          Estado Operativo
        </label>
        <select
          id="table-status-select"
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

      <button
        type="button"
        className="rtw-btn rtw-btn-outline"
        onClick={onReset}
      >
        <RotateCcw size={15} />
        Limpiar Filtros
      </button>
    </div>
  );
}
