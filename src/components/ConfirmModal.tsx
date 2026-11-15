import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  ruleReminder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  ruleReminder,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="rtw-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rtw-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="rtw-modal">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(212, 175, 55, 0.16)',
                border: '1px solid rgba(212, 175, 55, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <AlertTriangle size={18} color="#b8901d" />
            </span>
            <h2
              id="rtw-modal-title"
              style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--rtw-text-primary)' }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="rtw-btn rtw-btn-outline btn-sm"
            onClick={onCancel}
            aria-label="Cerrar modal"
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--rtw-text-secondary)', marginBottom: '16px' }}>
          {description}
        </p>

        {ruleReminder && (
          <div
            style={{
              backgroundColor: 'var(--rtw-warning-bg)',
              border: '1px solid var(--rtw-warning-border)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              color: 'var(--rtw-warning-text)',
              marginBottom: '18px'
            }}
          >
            {ruleReminder}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}
        >
          <button
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary"
            onClick={onConfirm}
          >
            <CheckCircle2 size={16} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
