import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface GlassDisclosureProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function GlassDisclosure({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  children
}: GlassDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rtw-disclosure">
      <button
        type="button"
        className="rtw-disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {icon && (
            <span
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '9px',
                background: 'rgba(15, 23, 42, 0.05)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--rtw-gold-ink)',
                flexShrink: 0
              }}
            >
              {icon}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{title}</span>
              {badge}
            </div>
            {subtitle && (
              <div style={{ fontSize: '0.76rem', color: 'var(--rtw-text-muted)', marginTop: '1px' }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <ChevronDown
          size={17}
          style={{
            color: 'var(--rtw-text-muted)',
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.22s var(--ease-spring)'
          }}
        />
      </button>

      {open && <div className="rtw-disclosure-body">{children}</div>}
    </div>
  );
}
