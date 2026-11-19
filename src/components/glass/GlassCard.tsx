import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export type GlassVariant = 'default' | 'elevated' | 'dark' | 'subtle';

interface GlassCardProps {
  children: ReactNode;
  variant?: GlassVariant;
  level?: 1 | 2 | 3 | 4;
  goldAccent?: boolean;
  specularFlare?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function GlassCard({
  children,
  variant = 'default',
  level,
  goldAccent = false,
  specularFlare = false,
  interactive = false,
  className = '',
  style
}: GlassCardProps) {
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const baseClass =
    variant === 'dark'
      ? 'rtw-card rtw-glass-dark'
      : variant === 'elevated'
        ? 'rtw-card rtw-glass-elevated'
        : variant === 'subtle'
          ? 'rtw-card'
          : 'rtw-card';

  const classes = [
    baseClass,
    level ? `rtw-glass-surface-${level}` : '',
    goldAccent ? 'rtw-card-gold-top' : '',
    specularFlare ? 'rtw-specular-flare' : '',
    interactive ? 'rtw-glass-interactive' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties | undefined =
    variant === 'subtle'
      ? { background: 'var(--glass-bg-subtle)', ...style }
      : style;

  return (
    <section
      className={classes}
      style={mergedStyle}
      onMouseMove={interactive ? handleMouseMove : undefined}
    >
      {children}
    </section>
  );
}
