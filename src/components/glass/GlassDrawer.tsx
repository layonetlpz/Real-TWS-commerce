import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface GlassDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function GlassDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520
}: GlassDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="rtw-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="rtw-drawer" style={{ width: `min(${width}px, 100vw)` }}>
        <div className="rtw-drawer-header">
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--rtw-text-primary)' }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ fontSize: '0.8rem', color: 'var(--rtw-text-secondary)', marginTop: '3px' }}>
                {subtitle}
              </p>
            )}
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="rtw-btn rtw-btn-outline btn-sm"
            onClick={onClose}
            aria-label="Cerrar panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rtw-drawer-body">{children}</div>

        {footer && <div className="rtw-drawer-footer">{footer}</div>}
      </aside>
    </div>
  );
}
