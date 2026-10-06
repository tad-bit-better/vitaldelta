import type { ExtractedWordResult } from '@vitaldelta/extraction';
import type { NewResult } from '../storage/types';

/** A result printed as a word, as edited on the review screen. */
export type WordDraft = {
  key: string;
  status: 'confirmed' | 'rejected';
  name: string;
  text: string;
  expected: string;
  edited: boolean;
  source: ExtractedWordResult | null;
};

export const wordRowId = (key: string) => `word-${key}`;

export function fromExtractedWord(w: ExtractedWordResult, i: number): WordDraft {
  return { key: String(i), status: 'confirmed', name: w.name, text: w.text, expected: w.expected ?? '', edited: false, source: w };
}

export function wordProblems(d: WordDraft): string[] {
  const out: string[] = [];
  if (!d.name.trim()) out.push('Enter the test name.');
  if (!d.text.trim()) out.push('Enter the result.');
  return out;
}

export function wordToNewResult(d: WordDraft): NewResult {
  return {
    markerId: null,
    name: d.name.trim(),
    value: null,
    textValue: d.text.trim(),
    expectedText: d.expected.trim() || null,
    method: d.source?.method ?? null,
    unit: null,
    comparator: null,
    refLow: null,
    refHigh: null,
    labFlag: null,
    confidence: 1,
    userEdited: d.edited || !d.source,
    original: d.source ? { valueText: d.source.text, unit: null, refText: d.source.expected } : null,
  };
}
