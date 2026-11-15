import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export type GlassVariant = 'default' | 'elevated' | 'dark' | 'subtle';

interface GlassCardProps {
  children: ReactNode;
  variant?: GlassVariant;
  goldAccent?: boolean;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function GlassCard({
  children,
  variant = 'default',
  goldAccent = false,
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
    goldAccent ? 'rtw-card-gold-top' : '',
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
