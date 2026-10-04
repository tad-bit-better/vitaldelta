import type { Row } from './types';

export type Comparator = '<' | '<=' | '>' | '>=';

/** A row split into its parts. Nothing here is matched or validated yet. */
export type ParsedRow = {
  name: string;
  value: number;
  /** The value as printed, e.g. "<0.5" or "1,50,000". */
  valueText: string;
  /** Set when the value itself is a bound, e.g. "<0.5" (below detection limit). */
  comparator: Comparator | null;
  unit: string | null;
  /** Null for one-sided ranges, e.g. "<200" has only refHigh. */
  refLow: number | null;
  refHigh: number | null;
  /** The reference range as printed. */
  refText: string | null;
  /**
   * The range was printed as labelled bands ("Deficiency <20 / Sufficiency 30-100 / ..."). The
   * range is the normal band when one was found on this row, otherwise empty.
   */
  banded: boolean;
  /** High/low flag printed by the lab, if any. */
  flag: 'high' | 'low' | null;
  /** The whole row text, for review screens and debugging. */
  text: string;
};

type Token = { text: string; startsItem: boolean };

const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?|\.\d+`;
const VALUE_RE = new RegExp(String.raw`^(<=|>=|[<>≤≥])?(${NUMBER})(H|L|\*|↑|↓)?$`);
const FLAGS: Record<string, 'high' | 'low'> = {
  H: 'high', HIGH: 'high', '↑': 'high', '*H': 'high',
  L: 'low', LOW: 'low', '↓': 'low', '*L': 'low',
};

const RANGE_PATTERNS: { re: RegExp; kind: 'between' | 'upper' | 'lower' }[] = [
  { re: new RegExp(String.raw`(${NUMBER})\s*(?:-|to)\s*(${NUMBER})`, 'i'), kind: 'between' },
  { re: new RegExp(String.raw`(?:<=|≤|<|up\s*to|below|less\s+than)\s*(${NUMBER})`, 'i'), kind: 'upper' },
  { re: new RegExp(String.raw`(?:>=|≥|>|above|more\s+than|greater\s+than)\s*(${NUMBER})`, 'i'), kind: 'lower' },
];

// Unit-looking tokens: anything with a "/" and a letter (mg/dL, /cumm, mL/min/1.73m²),
// a percent form (%, gm%), or a short list of standalone units.
const SLASH_UNIT_RE = /^(?=.*[a-zµμ])[a-zµμ%0-9.^²³*]*(?:\/[a-zµμ%0-9.^²³*]+)+$/i;
const PERCENT_UNIT_RE = /^[a-z]*%$/i;
const STANDALONE_UNITS = new Set(['fl', 'pg', 'ng', 'sec', 'secs', 'seconds', 'ratio', 'index', 'iu', 'u']);

/** Turns "1,50,000", "150,000" and "13,5" into numbers. */
export function parseNumber(text: string): number {
  if (/^\d{1,3}(,\d{2})*,\d{3}(\.\d+)?$/.test(text) || /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    return Number(text.replace(/,/g, ''));
  }
  if (/^\d+,\d+$/.test(text)) return Number(text.replace(',', '.'));
  return Number(text);
}

const ITEM_START = '\u0001';
const SUPERSCRIPTS: Record<string, string> = { '¹': '1', '²': '2', '³': '3', '⁶': '6', '⁹': '9' };

function normalise(text: string): string {
  return text
    .replace(/[\u00a0\u2009\u202f]/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/μ/g, 'µ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a row into tokens, remembering which ones start a PDF item (a column).
 * Superscript units are often split across items ("10", "3", "/µL"), so they're
 * joined on the whole row: "10 3 /µL", "x 10³/µL", "10^3 / uL" → "10^3/µL".
 */
function tokenise(row: Row): Token[] {
  const joined = row.items
    .map((item) => normalise(item.text))
    .filter(Boolean)
    .map((text) => ITEM_START + text)
    .join(' ')
    .replace(
      // The exponent must be separated from "10" (space, ^ or *) or be a superscript
      // character, so "1000/µL" (thousands per µL) isn't read as 10^00.
      /(?<![\d.])(?:[x×][\s\u0001]*)?10(?:(?:[\s\u0001]*[\^*][\s\u0001]*|[\s\u0001]+)(\d{1,2})|[\s\u0001]*([¹²³⁶⁹]))[\s\u0001]*\/[\s\u0001]*([a-zµ]+)/gi,
      (match: string, exp: string | undefined, sup: string | undefined, per: string) =>
        `${match.startsWith(ITEM_START) ? ITEM_START : ''}10^${exp ?? SUPERSCRIPTS[sup!]}/${per}`,
    );
  return joined
    .split(' ')
    .filter((t) => t.replaceAll(ITEM_START, ''))
    .map((t) => ({ text: t.replaceAll(ITEM_START, ''), startsItem: t.startsWith(ITEM_START) }));
}

// Numbers followed by these are ages or durations ("> 18 years", "≥3 months"), not ranges.
const NOT_A_RANGE_AFTER = /^\s*(?:years?|yrs?|y\b|months?|mths?|weeks?|wks?|days?)/i;

/** First match of `re` that isn't an age or duration. */
function findRange(text: string, re: RegExp): RegExpMatchArray | null {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(global)) {
    if (!NOT_A_RANGE_AFTER.test(text.slice(m.index! + m[0].length))) return m;
  }
  return null;
}

// Labels of interpretive bands. Each band is a label then its bound: "Desirable: <200",
// "Insufficiency :20-30", "Non-diabetic <5.7".
const BAND_LABEL = String.raw`(?:non[-\s]?diabet\w*|pre[-\s]?diabet\w*|diabet\w*|deficien\w*|insufficien\w*|sufficien\w*|toxic\w*|desirable|undesirable|borderline(?:\s+high|\s+low)?|near\s+optimal|above\s+optimal|optimal|normal|abnormal|very\s+high|high|very\s+low|low|elevated|adequate|inadequate|average|moderate|severe|mild|risk)`;
const BAND_RE = new RegExp(String.raw`\b(${BAND_LABEL})(?:\s*risk)?\s*(?:[:=]|(?=\s*(?:<=|>=|[<>≤≥]|\d|up\s*to|less|more|above|below)))`, 'gi');
// The band that means "within range".
const NORMAL_BAND = /^(?:sufficien|desirable|optimal|normal|non[-\s]?diabet|adequate)/i;

export type Bands = { normal: { label: string; refLow: number | null; refHigh: number | null; text: string } | null };

/** First bound in some text: "30 - 100", "<200", "> 40". */
function firstRange(text: string): { refLow: number | null; refHigh: number | null; text: string } | null {
  for (const { re, kind } of RANGE_PATTERNS) {
    const m = findRange(text, re);
    if (!m) continue;
    if (kind === 'between') return { refLow: parseNumber(m[1]), refHigh: parseNumber(m[2]), text: m[0].trim() };
    if (kind === 'upper') return { refLow: null, refHigh: parseNumber(m[1]), text: m[0].trim() };
    return { refLow: parseNumber(m[1]), refHigh: null, text: m[0].trim() };
  }
  return null;
}

/**
 * Reads a range printed as labelled bands. Returns null when the text isn't banded (fewer
 * than two band labels); otherwise the normal band's range, if there is one in the text.
 */
export function readBands(text: string): Bands | null {
  const labels = [...normalise(text).matchAll(BAND_RE)];
  if (labels.length < 2) return null;
  const clean = normalise(text);
  for (const [i, m] of labels.entries()) {
    if (!NORMAL_BAND.test(m[1])) continue;
    const bandText = clean.slice(m.index! + m[0].length, labels[i + 1]?.index ?? clean.length);
    const range = firstRange(bandText);
    if (range) return { normal: { label: m[1], ...range, text: `${m[1]} ${range.text}` } };
  }
  return { normal: null };
}

function isUnit(token: string): boolean {
  if (VALUE_RE.test(token)) return false;
  return SLASH_UNIT_RE.test(token) || PERCENT_UNIT_RE.test(token) || STANDALONE_UNITS.has(token.toLowerCase());
}

/**
 * Splits a row into name / value / unit / reference range using only its shape,
 * so it works across lab layouts. Returns null for rows that don't look like a result
 * (headers, addresses, notes). Matching names to markers happens later.
 */
export function parseRow(row: Row): ParsedRow | null {
  const tokens = tokenise(row);

  // The value is the first standalone number after some text. Prefer a number that
  // starts its own PDF item (a separate column) over one inside the name, like
  // the "25" in "Vitamin D 25 Hydroxy".
  const candidates = tokens
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => i > 0 && VALUE_RE.test(t.text) && tokens.slice(0, i).some((p) => /[a-z]/i.test(p.text)));
  const chosen = candidates.find(({ t }) => t.startsItem) ?? candidates[0];
  if (!chosen) return null;

  let name = tokens
    .slice(0, chosen.i)
    .map((t) => t.text)
    .join(' ')
    .replace(/^\d+[.)]?\s+/, '') // leading serial number
    .replace(/[\s:.-]+$/, '');
  // A comparator split from its number ends up on the name: "Triglycerides <" "150".
  const trailing = name.match(/\s*(<=|>=|[<>≤≥])$/);
  if (trailing) name = name.slice(0, trailing.index);
  if (!/[a-z]/i.test(name)) return null;

  const [, valueComparator, numberText, suffix] = chosen.t.text.match(VALUE_RE)!;
  const comparatorText = valueComparator ?? trailing?.[1];
  const value = parseNumber(numberText);
  if (!Number.isFinite(value)) return null;
  const comparator = comparatorText
    ? (({ '≤': '<=', '≥': '>=' } as Record<string, Comparator>)[comparatorText] ?? (comparatorText as Comparator))
    : null;
  let flag: ParsedRow['flag'] = suffix && suffix !== '*' ? FLAGS[suffix] : null;

  // Everything after the value: pull out the flag and unit, the rest holds the range.
  const rest: string[] = [];
  let unit: string | null = null;
  for (const { text } of tokens.slice(chosen.i + 1)) {
    const upper = text.toUpperCase();
    if (!flag && FLAGS[upper]) {
      flag = FLAGS[upper];
    } else if (!unit && isUnit(text)) {
      unit = text;
    } else {
      rest.push(text);
    }
  }

  const restText = rest.join(' ');
  let refLow: number | null = null;
  let refHigh: number | null = null;
  let refText: string | null = null;
  // Banded ranges: the first bound is usually the "deficient" or "high" band, never the range.
  const bands = readBands(restText);
  if (bands) {
    return {
      name,
      value,
      valueText: chosen.t.text.replace(/(H|L|\*|↑|↓)$/, ''),
      comparator,
      unit,
      refLow: bands.normal?.refLow ?? null,
      refHigh: bands.normal?.refHigh ?? null,
      refText: bands.normal?.text ?? restText,
      banded: true,
      flag,
      text: row.text,
    };
  }
  for (const { re, kind } of RANGE_PATTERNS) {
    const m = findRange(restText, re);
    if (!m) continue;
    refText = m[0].trim();
    if (kind === 'between') {
      refLow = parseNumber(m[1]);
      refHigh = parseNumber(m[2]);
    } else if (kind === 'upper') {
      refHigh = parseNumber(m[1]);
    } else {
      refLow = parseNumber(m[1]);
    }
    break;
  }

  return {
    name,
    value,
    valueText: chosen.t.text.replace(/(H|L|\*|↑|↓)$/, ''),
    comparator,
    unit,
    refLow,
    refHigh,
    refText,
    banded: false,
    flag,
    text: row.text,
  };
}
