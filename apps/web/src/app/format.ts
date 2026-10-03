const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "2024-03-11" → "11 Mar 2024". Dates are stored as plain days, so format in UTC. */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}

/** Trims float noise for display: 99.08800001 → 99.09. */
export function formatNumber(n: number): string {
  return String(Number(n.toPrecision(4)));
}
