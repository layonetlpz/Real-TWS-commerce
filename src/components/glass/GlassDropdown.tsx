import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface GlassDropdownOption {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface GlassDropdownProps {
  label: string;
  icon?: ReactNode;
  options: GlassDropdownOption[];
  variant?: 'outline' | 'primary' | 'ghost-dark';
}

export function GlassDropdown({
  label,
  icon,
  options,
  variant = 'outline'
}: GlassDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const enabled = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el && !el.disabled));
    if (enabled.length === 0) return;
    const idx = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      enabled[(idx + 1) % enabled.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      enabled[(idx - 1 + enabled.length) % enabled.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      enabled[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      enabled[enabled.length - 1]?.focus();
    }
  };

  const btnClass =
    variant === 'primary'
      ? 'rtw-btn rtw-btn-primary btn-sm'
      : variant === 'ghost-dark'
        ? 'rtw-btn rtw-btn-ghost-dark btn-sm'
        : 'rtw-btn rtw-btn-outline btn-sm';

  return (
    <div className="rtw-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={btnClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown
          size={14}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s var(--ease-spring)'
          }}
        />
      </button>

      {open && (
        <div className="rtw-dropdown-menu" role="menu" onKeyDown={handleMenuKeyDown}>
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              role="menuitem"
              disabled={opt.disabled}
              className="rtw-dropdown-item"
              onClick={() => {
                setOpen(false);
                opt.onClick();
              }}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
