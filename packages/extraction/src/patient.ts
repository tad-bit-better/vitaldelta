import type { Row, TextItem } from './types';

export type Sex = 'male' | 'female';

/** Who a report is for, as printed in its header. Only a suggestion; the user confirms. */
export type DetectedPatient = { name: string | null; sex: Sex | null; age: number | null };

/** A piece of text that is just a name label, with its colon printed separately. */
const LABEL_ONLY = /^(?:patient'?s?\s*name|pt\.?\s*name|name\s+of\s+(?:the\s+)?patient|patient|name)$/i;
const NAME_LABEL = /(?<!test\s|doctor\s|lab\s|ref(?:erring|\.)?\s|consultant\s)\b(?:patient'?s?\s*name|pt\.?\s*name|name\s+of\s+(?:the\s+)?patient|patient|name)\s*[:\-]\s*/i;
/**
 * Where a name value ends when the whole line is one piece of text: the next label.
 * A backup only; normally the column gap ends it (see nameAfterLabel).
 */
const NEXT_LABEL = /\s(?:age|sex|gender|dob|d\.o\.b|date|ref(?:erred)?|referring|sample|specimen|drawn|collect(?:ed|ion)|receiv(?:ed|ing)|regist(?:ered|ration)|report(?:ed|ing)?|uhid|mrn|id|lab\b|bill|visit|phone|mobile|tel|client|location|barcode|sid|ward|bed|panel|cent(?:re|er)|status|type|accession)\b|\s[|:]/i;

/** Gap (in multiples of text height) beyond which the next item is another column. */
const COLUMN_GAP = 1.5;

/**
 * The text after a name label, using layout: pieces of text are joined while they sit
 * close together (one phrase) and stop at a wide gap (the next column, e.g.
 * "Specimen Drawn ON"). Falls back to the line's text when it has no item positions.
 */
function nameAfterLabel(row: Row): string | null {
  const items = row.items.filter((i) => i.text.trim());
  for (let i = 0; i < items.length; i++) {
    // "Name : X" in one piece, or "Name" followed by a separate ":" piece.
    let label = items[i].text.match(NAME_LABEL);
    if (!label && /^[:\-]/.test(items[i + 1]?.text.trim() ?? '')) label = items[i].text.trim().match(LABEL_ONLY);
    if (!label) continue;
    const rest = items[i].text.slice(label.index! + label[0].length).trim();
    const parts: string[] = rest ? [rest] : [];
    let prev: TextItem = items[i];
    for (let j = i + 1; j < items.length; j++) {
      const item = items[j];
      const gap = item.x - (prev.x + prev.width);
      if (/^[:\-]+$/.test(item.text.trim()) && !parts.length) {
        prev = item; // the label's colon, printed separately
        continue;
      }
      if (parts.length && gap > Math.max(prev.height, item.height) * COLUMN_GAP) break;
      parts.push(item.text.trim());
      prev = item;
    }
    return parts.join(' ');
  }
  const label = row.text.match(NAME_LABEL);
  return label ? row.text.slice(label.index! + label[0].length) : null;
}
const TITLES = /^(?:mr|mrs|ms|miss|dr|master|baby|smt|shri|sri|mx|kum|km)\.?\s+/i;

function cleanName(raw: string): string | null {
  let name = raw.split(NEXT_LABEL)[0].replace(/[^\p{L}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  while (TITLES.test(name)) name = name.replace(TITLES, '');
  name = name.replace(/^[.\s-]+|[.\s-]+$/g, '');
  if (!/\p{L}{2}/u.test(name) || name.length > 60) return null;
  // "PUSHPENDRA KUMAR" → "Pushpendra Kumar"; leave mixed case as printed.
  return name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s.'-])\p{L}/gu, (c) => c.toUpperCase()) : name;
}

const SEX: Record<string, Sex> = { m: 'male', male: 'male', f: 'female', female: 'female' };

/** Reads patient name, sex and age from a report's header rows. */
export function detectPatient(rows: Row[]): DetectedPatient {
  const result: DetectedPatient = { name: null, sex: null, age: null };
  for (const row of rows) {
    const { text } = row;
    if (!result.name) {
      const raw = nameAfterLabel(row);
      if (raw) result.name = cleanName(raw);
    }
    const ageSex = text.match(/\bage\s*\/\s*(?:sex|gender)\s*[:\-]?\s*(\d{1,3})\s*(?:y|yr|yrs|years?)?\.?\s*\/\s*(male|female|m|f)\b/i);
    if (ageSex) {
      result.age ??= Number(ageSex[1]);
      result.sex ??= SEX[ageSex[2].toLowerCase()];
    }
    const sex = text.match(/\b(?:sex|gender)\s*[:\-]\s*(male|female|m|f)\b/i);
    if (sex) result.sex ??= SEX[sex[1].toLowerCase()];
    const age = text.match(/\bage\s*[:\-]\s*(\d{1,3})\s*(?:y|yr|yrs|years?)\b/i);
    if (age) result.age ??= Number(age[1]);
    if (result.name && result.sex && result.age !== null) break;
  }
  return result;
}

function nameTokens(name: string): string[] {
  let n = name.toLowerCase();
  while (TITLES.test(n)) n = n.replace(TITLES, '');
  return n.split(/[^\p{L}]+/u).filter(Boolean);
}

/** Edit distance, capped: returns as soon as it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...curr) > max) return max + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** Same word, an initial of it, or one typo in a word of 4+ letters. */
const tokensMatch = (a: string, b: string) =>
  a === b ||
  (a.length === 1 && b.startsWith(a)) ||
  (b.length === 1 && a.startsWith(b)) ||
  (a.length >= 4 && b.length >= 4 && editDistance(a, b, 1) <= 1);

/**
 * Fuzzy similarity of two person names (0–1), tolerant of titles, initials, case,
 * word order and small typos: "Mr. P Kumar" ≈ "Pushpendra Kumar". Matched words over
 * the longer name's word count, so an extra middle name lowers it only a little.
 */
export function nameSimilarity(a: string, b: string): number {
  const [x, y] = [nameTokens(a), nameTokens(b)];
  if (!x.length || !y.length) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const unused = [...long];
  let matched = 0;
  for (const t of short) {
    const i = unused.findIndex((u) => tokensMatch(t, u));
    if (i >= 0) {
      matched++;
      unused.splice(i, 1);
    }
  }
  return matched / long.length;
}

/** Names at or above this similarity are suggested as the same person. */
export const SAME_PERSON = 0.6;
