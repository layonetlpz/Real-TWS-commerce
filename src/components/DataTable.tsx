import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { TableColumn } from '../types/domain';
import { EmptyState, ErrorState } from './StatusStates';

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  pageSize?: number;
  mobileTitle?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  error = null,
  emptyTitle = 'Sin registros para mostrar',
  emptyDescription = 'Ajusta los filtros o agrega un nuevo registro para empezar.',
  emptyAction,
  onRetry,
  pageSize = 15,
  mobileTitle
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [data.length, sortKey, sortDir]);

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const targetCol = columns.find((col) => col.key === sortKey);
    if (!targetCol?.sortValue) return data;
    const extractor = targetCol.sortValue;
    return [...data].sort((a, b) => {
      const va = extractor(a);
      const vb = extractor(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va).toLowerCase();
      const sb = String(vb).toLowerCase();
      return sortDir === 'asc' ? sa.localeCompare(sb, 'es') : sb.localeCompare(sa, 'es');
    });
  }, [columns, data, sortDir, sortKey]);

  const effectivePageSize = pageSize > 0 ? pageSize : Math.max(sortedData.length, 1);
  const totalPages = Math.max(1, Math.ceil(sortedData.length / effectivePageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * effectivePageSize;
  const pageData = sortedData.slice(startIdx, startIdx + effectivePageSize);

  const toggleSort = (col: TableColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
    }
  };

  if (loading) {
    return (
      <div className="rtw-card" role="status" aria-label="Cargando tabla">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="rtw-skeleton" style={{ height: '34px', width: '100%' }} />
          <div className="rtw-skeleton" style={{ height: '24px', width: '96%' }} />
          <div className="rtw-skeleton" style={{ height: '24px', width: '92%' }} />
          <div className="rtw-skeleton" style={{ height: '24px', width: '98%' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (pageData.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div>
      {/* Vista de tabla para escritorio / tablet */}
      <div className="rtw-table-container rtw-desktop-table-wrap">
        <table className="rtw-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSortable = Boolean(col.sortValue);
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'inherit',
                          font: 'inherit',
                          textTransform: 'inherit',
                          letterSpacing: 'inherit',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
                        ) : (
                          <ArrowUpDown size={12} style={{ opacity: 0.6 }} />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, idx) => (
              <tr key={rowKey(row, startIdx + idx)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista en tarjetas para pantallas móviles */}
      <div className="rtw-mobile-cards">
        {pageData.map((row, idx) => (
          <div key={rowKey(row, startIdx + idx)} className="rtw-card">
            {mobileTitle && (
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  marginBottom: '10px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--rtw-border-light)'
                }}
              >
                {mobileTitle(row)}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {columns
                .filter((col) => !col.hideOnMobile)
                .map((col) => (
                  <div
                    key={col.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <span style={{ color: 'var(--rtw-text-muted)', fontWeight: 600 }}>
                      {col.header}
                    </span>
                    <span style={{ textAlign: 'right', fontWeight: 500 }}>
                      {col.render(row)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {sortedData.length > effectivePageSize && (
        <div className="rtw-pagination">
          <span>
            Mostrando <strong>{startIdx + 1}</strong>–
            <strong>{Math.min(startIdx + effectivePageSize, sortedData.length)}</strong> de{' '}
            <strong>{sortedData.length}</strong>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} />
              Anterior
            </button>
            <span style={{ fontSize: '0.78rem', padding: '0 6px', fontWeight: 600 }}>
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="rtw-btn rtw-btn-outline btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Siguiente
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
