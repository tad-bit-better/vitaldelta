import { describe, expect, it } from 'vitest';
import { detectReportDate, findDate } from './reportDate';
import type { Row } from './types';

const rows = (...texts: string[]): Row[] => texts.map((text, i) => ({ page: 1, y: i * 12, items: [], text }));

describe('findDate', () => {
  it('reads common formats, day first', () => {
    expect(findDate('12/03/2024')).toBe('2024-03-12');
    expect(findDate('12-03-24')).toBe('2024-03-12');
    expect(findDate('12.03.2024 10:42 AM')).toBe('2024-03-12');
    expect(findDate('2024-03-12')).toBe('2024-03-12');
    expect(findDate('12-Mar-2024')).toBe('2024-03-12');
    expect(findDate('12 March 2024')).toBe('2024-03-12');
    expect(findDate('Mar 12, 2024')).toBe('2024-03-12');
  });

  it('switches to month first only when day first is impossible', () => {
    expect(findDate('03/25/2024')).toBe('2024-03-25');
  });

  it('rejects impossible dates', () => {
    expect(findDate('31/02/2024')).toBeNull();
    expect(findDate('Ref 1234/5678')).toBeNull();
  });
});

describe('detectReportDate', () => {
  it('prefers the collection date over received and reported', () => {
    expect(
      detectReportDate(rows('Reported On : 14/03/2024', 'Registered On : 12/03/2024', 'Collected On : 11/03/2024 08:10')),
    ).toEqual({ date: '2024-03-11', source: 'collected' });
  });

  it('falls back to reported, then any date', () => {
    expect(detectReportDate(rows('Report Date: 14-Mar-2024'))).toEqual({ date: '2024-03-14', source: 'reported' });
    expect(detectReportDate(rows('Page 1', 'Printed 15/03/2024'))).toEqual({ date: '2024-03-15', source: 'other' });
  });

  it('never uses a date of birth', () => {
    expect(detectReportDate(rows('DOB: 01/01/1980', 'Date of Birth 01/01/1980'))).toBeNull();
    expect(detectReportDate(rows('DOB: 01/01/1980', 'Sample Collected 11/03/2024'))?.date).toBe('2024-03-11');
  });

  it('returns null without dates', () => {
    expect(detectReportDate(rows('Haemoglobin 13.5 g/dL'))).toBeNull();
  });
});
