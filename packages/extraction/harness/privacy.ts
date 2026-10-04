/**
 * Keeps real reports private when debugging tools print about them. Everything is masked
 * except words on a fixed public vocabulary (test names from the dictionary, units, and
 * common report terms), so nothing personal can appear unless it happens to be a lab term.
 */
import { createHash } from 'node:crypto';
import { canonicalUnit, markers } from '../src/index';

// Words printed on lab reports that say nothing about the patient. Never add words that
// describe the patient (sex, titles like Mr/Mrs, places): those must stay masked.
const REPORT_WORDS = `
  result results value values unit units reference range ranges interval biological normal method methods
  sample specimen test tests investigation investigations parameter parameters observed flag remarks remark
  comment comments interpretation note notes report reports page of end the and or for in on at to by with
  is are be as per not no yes
  negative positive reactive nonreactive non detected undetected absent present nil trace seen
  high low borderline desirable undesirable optimal near above below deficiency deficient insufficiency
  insufficient sufficiency sufficient toxicity toxic diabetic prediabetic pre risk average moderate severe mild
  elevated adequate inadequate abnormal critical
  serum plasma blood urine whole edta fluoride fasting random postprandial collected collection received
  reported registered registration date time age sex gender years year yrs months days
  patient name ref referred doctor dr lab laboratory id no sr uhid barcode
  hplc clia eclia elisa immunoassay chemiluminescence photometry spectrophotometry calculated colorimetric
  enzymatic turbidimetric immunoturbidimetric flow cytometry impedance microscopy rapid card antibody
  antibodies antigen surface hepatitis hiv hbsag hcv vdrl rpr typhidot widal dengue malaria culture sensitivity
  haematology hematology biochemistry immunology serology pathology clinical lipid profile liver function
  kidney renal thyroid complete differential panel package routine examination physical chemical microscopic
`;

// Whole test names and synonyms ("HbA1c", "T3"), which word-by-word matching would split.
const TEST_NAMES = new Set(markers.flatMap((m) => [m.name, ...m.synonyms]).map((s) => s.toLowerCase()));

const VOCABULARY = new Set<string>([
  ...REPORT_WORDS.split(/\s+/).filter(Boolean),
  ...markers.flatMap((m) => [m.name, ...m.synonyms]).flatMap((s) => s.toLowerCase().split(/[^\p{L}]+/u)),
].filter((w) => w.length >= 2));

export type MaskOptions = {
  /** Keep the length of each masked word and number (default: each becomes one character). */
  lengths?: boolean;
};

/**
 * Letters become a/A and digits 9; vocabulary words and units are kept; spaces and
 * ASCII punctuation are kept so the layout shows. By default every masked word or number
 * shrinks to one character, so not even lengths are revealed.
 */
export function mask(text: string, { lengths = false }: MaskOptions = {}): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token.replace(/ /g, '⍽');
      if (canonicalUnit(token) || TEST_NAMES.has(token.replace(/[,:;.]+$/, '').toLowerCase())) return token;
      return token
        .replace(/\p{L}+/gu, (word) => {
          if (VOCABULARY.has(word.toLowerCase())) return word;
          const masked = word.replace(/\p{L}/gu, (c) => (/\p{Lu}/u.test(c) ? 'A' : 'a'));
          return lengths ? masked : masked[0];
        })
        .replace(/\p{N}+/gu, (digits) => (lengths ? '9'.repeat(digits.length) : '9'))
        .replace(/[^\x20-\x7eAa9⍽]/gu, (c) => `<U+${c.codePointAt(0)!.toString(16)}>`);
    })
    .join('');
}

/**
 * How a fixture is named in output: its number in the sorted list (the same numbers in the
 * harness and the shape tool) and a short content fingerprint. File names often contain the
 * patient's name, so they're only shown with --names.
 */
export function fileLabel(index: number, bytes: Uint8Array, file: string, showNames: boolean): string {
  if (showNames) return file;
  const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  return index >= 0 ? `#${index + 1} ${fingerprint}` : `file ${fingerprint}`;
}
