// Spelling and wording differences that don't change what a test is, so the
// dictionary only needs synonyms that are genuinely different names.
const SPELLING: [RegExp, string][] = [
  [/haem/g, 'hem'], // haemoglobin → hemoglobin
  [/leuc/g, 'leuk'], // leucocyte → leukocyte
  [/oestr/g, 'estr'], // oestradiol → estradiol
  [/sulph/g, 'sulf'],
  [/γ/g, 'gamma'],
];

/** Words labs add that don't identify the test ("Serum Creatinine", "Hb Estimation"). */
const FILLER = new Set(['serum', 'plasma', 'blood', 'whole', 'level', 'levels', 'value', 'estimation', 'test', 's']);

/**
 * Reduces a printed test name to a comparison key: lowercase, US spelling,
 * no punctuation, spacing or filler words. "S. Haemoglobin (Hb)" → "hemoglobinhb".
 */
export function nameKey(name: string): string {
  let text = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [re, replacement] of SPELLING) text = text.replace(re, replacement);
  return text
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !FILLER.has(word))
    .join('');
}
