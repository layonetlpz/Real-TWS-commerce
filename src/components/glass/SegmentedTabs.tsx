import type { KeyboardEvent, ReactNode } from 'react';

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
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    const currentIndex = items.findIndex((i) => i.id === value);
    let nextIndex = -1;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length;
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = items.length - 1;

    if (nextIndex >= 0) {
      e.preventDefault();
      onChange(items[nextIndex].id);
      const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons[nextIndex]?.focus();
    }
  };

  return (
    <div
      className={`rtw-segmented ${variant === 'dark' ? 'rtw-segmented-dark' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
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
