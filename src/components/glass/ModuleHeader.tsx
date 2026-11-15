import type { ReactNode } from 'react';

interface ModuleHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  bottomSlot?: ReactNode;
  variant?: 'light' | 'dark';
}

export function ModuleHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  actions,
  bottomSlot,
  variant = 'light'
}: ModuleHeaderProps) {
  const isDark = variant === 'dark';

  return (
    <header
      className={`rtw-module-header ${isDark ? 'rtw-module-header-dark' : ''}`}
      style={{ flexDirection: 'column', alignItems: 'stretch' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
          {(eyebrow || badge) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {eyebrow && (
                <span className="rtw-module-eyebrow" style={{ marginBottom: 0 }}>
                  {eyebrow}
                </span>
              )}
              {badge}
            </div>
          )}
          <h2 className="rtw-module-title">{title}</h2>
          {subtitle && <p className="rtw-module-subtitle">{subtitle}</p>}
        </div>

        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>

      {bottomSlot && (
        <div
          style={{
            paddingTop: '14px',
            borderTop: isDark
              ? '1px solid rgba(255, 255, 255, 0.10)'
              : '1px solid rgba(15, 23, 42, 0.08)'
          }}
        >
          {bottomSlot}
        </div>
      )}
    </header>
  );
}
