import type { ReactNode } from 'react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'light' | 'dark';
  ariaLabel?: string;
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'light',
  ariaLabel = 'Secciones del módulo'
}: SegmentedTabsProps<T>) {
  return (
    <div
      className={`rtw-segmented ${variant === 'dark' ? 'rtw-segmented-dark' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`rtw-segmented-btn ${active ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span className="rtw-segmented-count">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
