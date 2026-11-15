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
  confirmLabel = 'Confirmar Operación',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} color="#d4af37" />
            <h2
              id="rtw-modal-title"
              style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827' }}
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

        <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: '14px' }}>
          {description}
        </p>

        {ruleReminder && (
          <div
            style={{
              backgroundColor: '#fef9e7',
              border: '1px solid rgba(212, 175, 55, 0.45)',
              borderRadius: '6px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              color: '#78350f',
              marginBottom: '18px'
            }}
          >
            <strong>Nota de control operativo:</strong> {ruleReminder}
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
