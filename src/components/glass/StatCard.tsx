import type { MouseEvent, ReactNode } from 'react';

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
    bg: 'rgba(15, 23, 42, 0.05)',
    color: '#334155',
    border: 'rgba(15, 23, 42, 0.08)'
  },
  success: {
    bg: 'rgba(34, 197, 94, 0.12)',
    color: '#15803d',
    border: 'rgba(34, 197, 94, 0.24)'
  },
  warning: {
    bg: 'rgba(217, 119, 6, 0.12)',
    color: '#92400e',
    border: 'rgba(217, 119, 6, 0.24)'
  },
  danger: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: '#b91c1c',
    border: 'rgba(239, 68, 68, 0.24)'
  },
  gold: {
    bg: 'rgba(212, 175, 55, 0.16)',
    color: '#846205',
    border: 'rgba(212, 175, 55, 0.32)'
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

  return (
    <article
      className={`rtw-kpi-card rtw-glass-interactive ${
        staggerIndex ? `rtw-stagger-${staggerIndex}` : ''
      }`}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onMouseMove={handleMouseMove}
      onClick={onClick}
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
