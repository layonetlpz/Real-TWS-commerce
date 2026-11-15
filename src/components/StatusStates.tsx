import { AlertCircle, Info, Loader2, RefreshCw } from 'lucide-react';

export function LoadingState({ label = 'Cargando información...' }: { label?: string }) {
  return (
    <div
      className="rtw-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '24px',
        color: '#475569'
      }}
      role="status"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Loader2 size={19} color="#d4af37" />
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</span>
      </div>
      <div className="rtw-skeleton" style={{ height: '14px', width: '72%' }} />
      <div className="rtw-skeleton" style={{ height: '14px', width: '48%' }} />
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
        borderLeft: '4px solid #991b1b',
        backgroundColor: '#fef2f2'
      }}
      role="alert"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} color="#991b1b" />
          <div>
            <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.92rem' }}>
              No se pudo completar la consulta
            </div>
            <div style={{ fontSize: '0.84rem', color: '#7f1d1d' }}>{message}</div>
          </div>
        </div>

        {onRetry && (
          <button
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={onRetry}
          >
            <RefreshCw size={15} />
            Reintentar
          </button>
        )}
      </div>
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
    <div
      className="rtw-card rtw-card-gold-top"
      style={{
        background: 'linear-gradient(135deg, #171e29 0%, #1f2937 100%)',
        color: '#f8fafc'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span className="rtw-badge rtw-badge-gold">
          <Info size={13} />
          Módulo Corporativo REAL TWS
        </span>
      </div>

      <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d4af37', marginBottom: '6px' }}>
        {moduleLabel}
      </h2>
      <p style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>{summary}</p>
    </div>
  );
}
