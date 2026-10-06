// Small line icons, drawn inline (no icon font or image requests). Decorative: the button or
// link next to them carries the text.
const PATHS = {
  plus: 'M12 5v14M5 12h14',
  chevron: 'm6 9 6 6 6-6',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  trend: 'm3 17 6-6 4 4 8-8M15 7h6v6',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'dots' ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The delta from the app icon. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="96 110 320 290" aria-hidden="true" className="app-logo-mark">
      <path d="M256 122 404 386H108Z" fill="none" stroke="currentColor" strokeWidth="40" strokeLinejoin="round" />
    </svg>
  );
}
