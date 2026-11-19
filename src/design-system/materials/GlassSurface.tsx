import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { GLASS_SURFACE_LEVELS, type GlassSurfaceLevel } from '../tokens/designTokens';

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  level?: GlassSurfaceLevel;
  as?: 'div' | 'section' | 'article' | 'aside' | 'header';
  specularFlare?: boolean;
  goldRim?: boolean;
  interactive?: boolean;
  style?: CSSProperties;
}

export function GlassSurface({
  children,
  level = 2,
  as: Tag = 'div',
  specularFlare = false,
  goldRim = false,
  interactive = false,
  className = '',
  style,
  onMouseMove,
  ...rest
}: GlassSurfaceProps) {
  const surfaceConfig = GLASS_SURFACE_LEVELS[level];

  const handleMouseMove = (e: MouseEvent<HTMLElement>) => {
    if (interactive) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
      e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    }
    onMouseMove?.(e);
  };

  const classes = [
    surfaceConfig.className,
    specularFlare ? 'rtw-specular-flare' : '',
    goldRim ? 'rtw-gold-rim' : '',
    interactive ? 'rtw-glass-interactive' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag
      className={classes}
      style={style}
      onMouseMove={interactive || onMouseMove ? handleMouseMove : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
