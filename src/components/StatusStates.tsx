import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Info, Loader2, RefreshCw } from 'lucide-react';

export function LoadingState({ label = 'Cargando información...' }: { label?: string }) {
  return (
    <div
      className="rtw-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '26px',
        color: 'var(--rtw-text-secondary)'
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '11px',
            background: 'rgba(212, 175, 55, 0.14)',
            border: '1px solid rgba(212, 175, 55, 0.32)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Loader2 size={18} color="#b8901d" className="rtw-spin" />
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--rtw-text-primary)' }}>
            {label}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)' }}>
            Preparando vista...
          </div>
        </div>
      </div>
      <div className="rtw-skeleton" style={{ height: '14px', width: '74%' }} />
      <div className="rtw-skeleton" style={{ height: '14px', width: '52%' }} />
      <div className="rtw-skeleton" style={{ height: '14px', width: '64%' }} />
    </div>
  );
}

export function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rtw-card"
      style={{
        borderLeft: '4px solid var(--rtw-danger-text)',
        background: 'var(--rtw-danger-bg)'
      }}
      role="alert"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <AlertCircle size={20} color="var(--rtw-danger-text)" />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--rtw-danger-text)', fontSize: '0.92rem' }}>
              No pudimos cargar esta información
            </div>
            <div style={{ fontSize: '0.83rem', color: '#7f1d1d', marginTop: '2px' }}>{message}</div>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            className="rtw-btn rtw-btn-outline btn-sm"
            onClick={onRetry}
          >
            <RefreshCw size={14} />
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '34px 20px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        borderRadius: '14px',
        background: 'rgba(248, 250, 252, 0.56)',
        border: '1px dashed rgba(15, 23, 42, 0.14)'
      }}
    >
      <span
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '14px',
          background: 'rgba(212, 175, 55, 0.12)',
          border: '1px solid rgba(212, 175, 55, 0.28)',
          color: 'var(--rtw-gold-ink)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon ?? <Inbox size={20} />}
      </span>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--rtw-text-primary)' }}>
        {title}
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--rtw-text-secondary)', maxWidth: '420px' }}>
        {description}
      </p>
      {action && <div style={{ marginTop: '4px' }}>{action}</div>}
    </div>
  );
}

export function PendingModuleBanner({
  moduleLabel,
  summary
}: {
  phaseNumber?: number;
  moduleLabel: string;
  summary: string;
}) {
  return (
    <div className="rtw-module-header rtw-module-header-dark">
      <div>
        <div className="rtw-module-eyebrow">
          <Info size={13} />
          REAL TWS
        </div>
        <h2 className="rtw-module-title">{moduleLabel}</h2>
        <p className="rtw-module-subtitle">{summary}</p>
      </div>
    </div>
  );
}
