import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  ruleReminder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirming?: boolean;
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
  confirming = false,
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, confirming, onCancel]);

  if (!open) return null;

  return (
    <div
      className="rtw-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rtw-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel();
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
            disabled={confirming}
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
            ref={cancelBtnRef}
            type="button"
            className="rtw-btn rtw-btn-outline"
            onClick={onCancel}
            disabled={confirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rtw-btn rtw-btn-primary"
            onClick={onConfirm}
            disabled={confirming}
          >
            <CheckCircle2 size={16} />
            {confirming ? 'Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
