import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'gold';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  staggerIndex?: 1 | 2 | 3 | 4 | 5;
  onClick?: () => void;
}

const TONE_VALUE_COLOR: Record<StatTone, string> = {
  default: 'var(--rtw-text-primary)',
  success: 'var(--rtw-success-text)',
  warning: 'var(--rtw-warning-text)',
  danger: 'var(--rtw-danger-text)',
  gold: 'var(--rtw-gold-ink)'
};

const TONE_ICON_BG: Record<StatTone, { bg: string; color: string; border: string }> = {
  default: {
    bg: 'var(--color-surface-inset)',
    color: 'var(--rtw-text-secondary)',
    border: 'var(--rtw-border-light)'
  },
  success: {
    bg: 'var(--rtw-success-bg)',
    color: 'var(--rtw-success-text)',
    border: 'var(--rtw-success-border)'
  },
  warning: {
    bg: 'var(--rtw-warning-bg)',
    color: 'var(--rtw-warning-text)',
    border: 'var(--rtw-warning-border)'
  },
  danger: {
    bg: 'var(--rtw-danger-bg)',
    color: 'var(--rtw-danger-text)',
    border: 'var(--rtw-danger-border)'
  },
  gold: {
    bg: 'var(--rtw-gold-soft)',
    color: 'var(--rtw-gold-ink)',
    border: 'var(--rtw-gold-border)'
  }
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  staggerIndex,
  onClick
}: StatCardProps) {
  const iconStyle = TONE_ICON_BG[tone];
  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article
      className={`rtw-kpi-card rtw-glass-interactive ${
        staggerIndex ? `rtw-stagger-${staggerIndex}` : ''
      }`}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onMouseMove={handleMouseMove}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="rtw-stat-top">
        <span className="rtw-kpi-label">{label}</span>
        {icon && (
          <span
            className="rtw-stat-icon"
            style={{
              background: iconStyle.bg,
              color: iconStyle.color,
              borderColor: iconStyle.border
            }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <div className="rtw-kpi-value" style={{ color: TONE_VALUE_COLOR[tone] }}>
        {value}
      </div>

      {sub && <div className="rtw-kpi-sub">{sub}</div>}
    </article>
  );
}
