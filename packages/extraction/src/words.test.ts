import { describe, expect, it } from 'vitest';
import type { Row, TextItem } from './types';
import { extractWordResults, hasWordResults, sameWord, wordStatus } from './words';

// Synthetic rows only. Each string is one PDF item (one column).
function row(...cells: string[]): Row {
  let x = 40;
  const items: TextItem[] = cells.map((text) => {
    const item = { text, x, y: 100, width: text.length * 5, height: 10, page: 1 };
    x += text.length * 5 + 20;
    return item;
  });
  return { page: 1, y: 105, items, text: cells.join(' ') };
}

describe('extractWordResults', () => {
  it('reads a word result and the expected word beside it', () => {
    expect(extractWordResults([row('HIV Antibody, Rapid Card', 'Non Reactive', 'Non Reactive', '---')])).toEqual([
      {
        name: 'HIV Antibody', text: 'Non Reactive', expected: 'Non Reactive', page: 1,
        // The whole row, so the review screen can show where it was printed.
        box: { page: 1, x: 40, y: 100, width: 315, height: 10 },
        method: 'Rapid Card',
      },
    ]);
    expect(extractWordResults([row('HBsAg', 'Reactive')])[0]).toMatchObject({ text: 'Reactive', expected: null });
  });

  it('splits a method off the name, from the name or the line below', () => {
    expect(extractWordResults([row('HIV Antibody, Rapid Card', 'Non Reactive', 'Non Reactive')])[0]).toMatchObject({ name: 'HIV Antibody', method: 'Rapid Card' });
    const below = { ...row('Method : Immunochromatography'), y: 120 };
    expect(extractWordResults([row('HBsAg', 'Non Reactive'), below])[0]).toMatchObject({ name: 'HBsAg', method: 'Immunochromatography' });
  });

  it('keeps digits that are part of a test name', () => {
    expect(extractWordResults([row('HIV 1 & 2 Antibodies', 'Not Detected', 'Not Detected')])[0].name).toBe('HIV 1 & 2 Antibodies');
  });

  it('skips numeric results, labels and lone words', () => {
    expect(extractWordResults([row('Glucose', '95', 'mg/dL', 'Normal')])).toEqual([]);
    expect(extractWordResults([row('Remarks :', 'Normal')])).toEqual([]);
    expect(extractWordResults([row('Negative')])).toEqual([]);
    expect(extractWordResults([row('Haemoglobin', '13.5', 'g/dL', '13.0 - 17.0')])).toEqual([]);
  });

  it('drops a repeated row (headers repeated on every page)', () => {
    expect(extractWordResults([row('HBsAg', 'Negative', 'Negative'), row('HBsAg', 'Negative', 'Negative')])).toHaveLength(1);
  });

  it('spots reports with word results', () => {
    expect(hasWordResults([row('Urine Sugar', 'Nil', 'Nil')])).toBe(true);
    expect(hasWordResults([row('Haemoglobin', '13.5', 'g/dL')])).toBe(false);
  });
});

describe('wordStatus', () => {
  it('compares only with the report’s expected word', () => {
    expect(wordStatus('Non-Reactive', 'Non Reactive')).toBe('as-expected');
    expect(wordStatus('Reactive', 'Non Reactive')).toBe('differs');
    expect(wordStatus('Positive', null)).toBe('no-expected');
    expect(sameWord('NOT DETECTED', 'not-detected')).toBe(true);
  });
});
