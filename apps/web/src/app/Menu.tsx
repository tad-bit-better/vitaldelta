import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A button that opens a small list of actions or links below it. Closes on Escape (focus
 * returns to the button), on a click outside, and after choosing an item.
 */
export default function Menu({ label, button, className = '', align = 'end', children }: {
  /** Accessible name for the button, e.g. "More actions for Dad". */
  label: string;
  button: ReactNode;
  className?: string;
  align?: 'start' | 'end';
  /** Items: buttons or links; each closes the menu when clicked. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    // Move focus into the menu so keyboard users land on the first item.
    root.current?.querySelector<HTMLElement>('.app-menu-list a, .app-menu-list button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className={`app-menu ${className}`} ref={root}>
      <button
        ref={trigger}
        type="button"
        className="app-menu-btn"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
      </button>
      <div
        id={id}
        className={`app-menu-list app-menu-${align}`}
        hidden={!open}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a, button')) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
