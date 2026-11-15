import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import type { ToastMessage } from '../types/domain';

const TYPE_META: Record<
  ToastMessage['type'],
  { label: string; color: string; Icon: typeof Info }
> = {
  success: { label: 'Confirmado', color: '#22c55e', Icon: CheckCircle2 },
  warning: { label: 'Advertencia', color: '#d4af37', Icon: AlertTriangle },
  error: { label: 'Error', color: '#ef4444', Icon: XCircle },
  info: { label: 'Información', color: '#38bdf8', Icon: Info }
};

export function NotificationCenter() {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div
      className="rtw-toast-stack"
      role="region"
      aria-live="polite"
      aria-label="Notificaciones del sistema"
    >
      {notifications.map((item) => {
        const meta = TYPE_META[item.type] || TYPE_META.info;
        const Icon = meta.Icon;
        return (
          <div
            key={item.id}
            className="rtw-toast"
            style={{ borderLeftColor: meta.color }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <Icon size={17} color={meta.color} style={{ marginTop: '2px', flexShrink: 0 }} />
              <div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: meta.color,
                    marginBottom: '2px'
                  }}
                >
                  {meta.label} · {item.timestamp}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#f8fafc' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '2px' }}>
                  {item.description}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '2px'
              }}
              aria-label="Descartar notificación"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
