/**
 * Canonical units and the spellings labs print for them. Equivalent units share
 * one canonical form (IU/L = U/L, mIU/L = µIU/mL, 10^9/L = 10^3/µL).
 */
const ALIASES: Record<string, string[]> = {
  'g/dL': ['g/dl', 'gm/dl', 'gms/dl', 'gram/dl', 'grams/dl', 'gm%', 'g%', 'gms%'],
  'g/L': ['g/l', 'gm/l'],
  'mg/dL': ['mg/dl', 'mgs/dl', 'mg%'],
  'mg/L': ['mg/l'],
  'mmol/L': ['mmol/l'],
  'µmol/L': ['µmol/l'],
  'nmol/L': ['nmol/l'],
  'pmol/L': ['pmol/l'],
  'mmol/mol': ['mmol/mol'],
  'mEq/L': ['meq/l'],
  'U/L': ['u/l', 'iu/l', 'units/l'],
  'µIU/mL': ['µiu/ml', 'miu/l', 'µu/ml'],
  'ng/mL': ['ng/ml', 'µg/l'],
  'ng/dL': ['ng/dl'],
  'pg/mL': ['pg/ml', 'ng/l'],
  'µg/dL': ['µg/dl'],
  fL: ['fl', 'femtolitre', 'femtoliter', 'cumicrons', 'cumicron', 'µm3', 'µ3'],
  pg: ['pg', 'picogram', 'picograms'],
  '%': ['%', 'percent'],
  'L/L': ['l/l'],
  'mm/hr': ['mm/hr', 'mm/h', 'mm/hour', 'mm/1sthr', 'mm/1st', 'mm/1sthour', 'mm/1hr'],
  'mL/min/1.73m²': ['ml/min/1.73m²', 'ml/min/1.73m2', 'ml/min/1.73', 'ml/min/1.73sqm'],
  ratio: ['ratio'],
  // Cell counts, per microlitre.
  '/µL': ['/µl', '/cumm', '/cmm', '/mm3', 'cells/µl', 'cells/cumm', 'cells/mm3'],
  '10^3/µL': [
    '10^3/µl', '10^3/cumm', '10^3/mm3', '10^3/cmm', 'k/µl', 'thou/µl', 'thou/cumm', '10^9/l',
    '1000/µl', '1000/cumm', '1000/mm3',
  ],
  'lakh/µL': ['lakh/µl', 'lakhs/µl', 'lakh/cumm', 'lakhs/cumm', 'lakh/mm3', 'lakhs/mm3', 'lakhs/cmm'],
  '10^6/µL': [
    '10^6/µl', '10^6/cumm', '10^6/mm3', 'million/µl', 'millions/µl', 'million/cumm',
    'millions/cumm', 'million/cmm', 'mill/cumm', 'mil/µl', 'm/µl', '10^12/l',
  ],
};

/** Count units as powers of ten per microlitre, so any two convert generically. */
const COUNT_EXPONENT: Record<string, number> = { '/µL': 0, '10^3/µL': 3, 'lakh/µL': 5, '10^6/µL': 6 };

/**
 * Units that convert within their own kind for any marker: mass concentration
 * (in g/L) and molar concentration (in mol/L). Converting between the two kinds
 * needs the marker's molar mass, so that stays in the dictionary.
 */
const GENERIC_FACTOR: Record<string, { kind: 'mass' | 'molar'; factor: number }> = {
  'g/dL': { kind: 'mass', factor: 10 },
  'g/L': { kind: 'mass', factor: 1 },
  'mg/dL': { kind: 'mass', factor: 1e-2 },
  'mg/L': { kind: 'mass', factor: 1e-3 },
  'µg/dL': { kind: 'mass', factor: 1e-5 },
  'ng/mL': { kind: 'mass', factor: 1e-6 },
  'ng/dL': { kind: 'mass', factor: 1e-8 },
  'pg/mL': { kind: 'mass', factor: 1e-9 },
  'mmol/L': { kind: 'molar', factor: 1e-3 },
  'µmol/L': { kind: 'molar', factor: 1e-6 },
  'nmol/L': { kind: 'molar', factor: 1e-9 },
  'pmol/L': { kind: 'molar', factor: 1e-12 },
};

function genericConvert(value: number, from: string, to: string): number | null {
  const a = GENERIC_FACTOR[from];
  const b = GENERIC_FACTOR[to];
  if (from in COUNT_EXPONENT && to in COUNT_EXPONENT) return value * 10 ** (COUNT_EXPONENT[from] - COUNT_EXPONENT[to]);
  if (a && b && a.kind === b.kind) return (value * a.factor) / b.factor;
  return null;
}

const LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIASES)) {
  for (const alias of [canonical, ...aliases]) LOOKUP.set(unitKey(alias), canonical);
}

function unitKey(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/μ/g, 'µ')
    .replace(/^x(?=10)/, '') // "x10^3/µL"
    .replace(/micro|mc(?=[gl])/g, 'µ') // "mcg/dL", "micromol/L"
    .replace(/^u(?=iu|u\/|g\/|mol)/, 'µ') // "uIU/mL", "ug/dL", "umol/L" (but not "U/L")
    .replace(/\/ul$/, '/µl') // "10^3/uL"
    .replace(/\.(?!\d)/g, ''); // "cu.mm", "sq.m" (but not "1.73")
}

/** The canonical form of a printed unit, or null if we don't recognise it. */
export function canonicalUnit(unit: string): string | null {
  return LOOKUP.get(unitKey(unit)) ?? null;
}

/** A conversion into a marker's standard unit: standard = value × factor + offset. */
export type Conversion = number | { factor: number; offset: number };

const apply = (value: number, c: Conversion) => (typeof c === 'number' ? value * c : value * c.factor + c.offset);

/**
 * Converts a value from a canonical unit into `standardUnit`. Cell counts, mass and
 * molar concentrations convert generically within their kind; crossing kinds (e.g.
 * mmol/L → mg/dL) uses the marker's `conversions`, reached via a generic step if
 * needed (pmol/L → nmol/L → ng/dL). Returns null when there's no known conversion.
 */
export function convert(
  value: number,
  unit: string,
  standardUnit: string,
  conversions: Record<string, Conversion> = {},
): number | null {
  if (unit === standardUnit) return value;
  const generic = genericConvert(value, unit, standardUnit);
  if (generic !== null) return generic;
  if (conversions[unit] !== undefined) return apply(value, conversions[unit]);
  for (const [via, conversion] of Object.entries(conversions)) {
    const step = genericConvert(value, unit, via);
    if (step !== null) return apply(step, conversion);
  }
  return null;
}
