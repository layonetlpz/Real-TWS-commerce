import { useEffect, useRef, useState, type ReactNode } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const btnClass =
    variant === 'primary'
      ? 'rtw-btn rtw-btn-primary btn-sm'
      : variant === 'ghost-dark'
        ? 'rtw-btn rtw-btn-ghost-dark btn-sm'
        : 'rtw-btn rtw-btn-outline btn-sm';

  return (
    <div className="rtw-dropdown" ref={containerRef}>
      <button
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
        <div className="rtw-dropdown-menu" role="menu">
          {options.map((opt) => (
            <button
              key={opt.id}
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
