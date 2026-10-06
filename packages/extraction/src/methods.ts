/**
 * Assay methods labs print next to a test name ("HbA1c (HPLC)", "Glucose - Hexokinase",
 * "Method: Jaffe"). They're split off so the name matches the dictionary, and kept as the
 * result's method: different methods often explain different ranges between labs.
 *
 * A piece of text is a method when every word is a method word and at least one is a
 * specific method name. Generic words ("direct", "rapid", "modified") only count next to a
 * specific one; "direct" only in "direct ISE", so "Bilirubin (Direct)" stays direct bilirubin. Words that are also test
 * names ("microscopy", "electrophoresis", "culture") are left out on purpose.
 */
const SPECIFIC = new Set(
  `
  photometry photometric colorimetric colorimetry colourimetric spectrophotometry spectrophotometric
  spectrometry enzymatic enzymic kinetic hexokinase god pod gpo chod pap trinder
  hplc clia eclia cmia elfa elisa eia ria fia immunoassay immunoturbidimetric immunoturbidimetry
  turbidimetric turbidimetry nephelometry nephelometric chemiluminescence chemiluminescent
  electrochemiluminescence immunofluorescence fluorescence fluorometric fluorimetric
  jaffe ifcc uricase biuret bcg bcp bromocresol dpd diazo jendrassik grof szasz pnpp
  calculated calculation derived computed friedewald impedance cytometry westergren wintrobe
  ise arsenazo ocpc cpc xylidyl ferrozine peg homogeneous agglutination immunochromatography
  immunochromatographic chromatography card cyanmethemoglobin sls coulter pcr lc ms
`
    .split(/\s+/)
    .filter(Boolean),
);

const GENERIC = new Set(
  `
  method methods methodology by with without and or using modified rate end point
  endpoint reaction assay technique automated auto analyser analyzer uv nadh rapid electrode
  electrodes ion selective flow electrical buffer amp p5p green purple blue latex tandem mass
  rt reverse phase high performance liquid sandwich competitive two step enhanced
`
    .split(/\s+/)
    .filter(Boolean),
);

// "Direct" and "indirect" are test names too (direct bilirubin), so they only count as part of
// "direct ISE" / "indirect ISE".
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/\b(?:in)?direct\s+ise\b/g, 'ise')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 || /\d/.test(w));

/** True when the text is only an assay method ("HPLC", "Direct ISE", "GOD-POD", "Method: Jaffe's"). */
export function isMethod(text: string): boolean {
  const list = words(text);
  return list.length > 0 && list.every((w) => SPECIFIC.has(w) || GENERIC.has(w)) && list.some((w) => SPECIFIC.has(w));
}

/** Trims punctuation left at the edges after cutting a method out. */
const tidy = (s: string) => s.replace(/^[\s,:;/–—-]+|[\s,:;/–—-]+$/g, '').replace(/\s{2,}/g, ' ');
const tidyMethod = (s: string) => tidy(s.replace(/^\s*(?:method(?:ology)?|by)\b\s*[:\-–]?\s*/i, ''));

/**
 * Splits an assay method off a printed test name: in brackets, after "Method:" or "by",
 * after a separator (" - ", ", ", ": ", " / "), or as trailing words. The name keeps at
 * least one word that isn't a method.
 */
export function splitMethod(printed: string): { name: string; method: string | null } {
  let name = printed;
  const found: string[] = [];

  // "(HPLC)", "[Enzymatic]"
  name = name.replace(/\s*[([]([^()[\]]*)[)\]]/g, (whole, inner: string) => (isMethod(inner) ? (found.push(tidyMethod(inner)), ' ') : whole));

  // "… Method: Jaffe", "… by Hexokinase"
  const labelled = name.match(/^(.*?\S)\s*(?:[,;:–—-]\s*)?\b(?:method(?:ology)?\s*[:\-–]|by\s+)\s*(.+)$/i);
  if (labelled && isMethod(labelled[2]) && /[a-z]/i.test(labelled[1])) {
    found.push(tidyMethod(labelled[2]));
    name = labelled[1];
  }

  // "Glucose Fasting - Hexokinase", "Creatinine, Jaffe", "TSH : CLIA"; repeatedly for "X, Enzymatic - IFCC".
  for (;;) {
    const m = name.match(/^(.*\S)\s*(?:\s[-–—/]\s|,\s*|:\s*|;\s*)(.+)$/);
    if (!m || !isMethod(m[2]) || !hasTestWord(m[1])) break;
    found.unshift(tidyMethod(m[2]));
    name = m[1];
  }

  // Trailing words: "HbA1c HPLC", "Uric Acid Uricase". Only the shortest method suffix, so a
  // test word before it is never taken ("Bilirubin Direct Diazo" keeps "Direct").
  const parts = name.trim().split(/\s+/);
  for (let cut = parts.length - 1; cut >= 1; cut--) {
    if (!isMethod(parts.slice(cut).join(' '))) continue;
    // Take generic words too only when what's left still reads as a test ("Sodium Direct ISE").
    while (cut > 1 && isMethod(parts.slice(cut - 1).join(' ')) && hasTestWord(parts.slice(0, cut - 1).join(' '))) cut--;
    if (hasTestWord(parts.slice(0, cut).join(' '))) {
      found.unshift(parts.slice(cut).join(' '));
      name = parts.slice(0, cut).join(' ');
    }
    break;
  }

  const method = found.filter(Boolean).join(', ') || null;
  return { name: tidy(name) || printed.trim(), method };
}

/** At least one word that isn't a method word, so a name is never cut down to nothing. */
function hasTestWord(text: string): boolean {
  return words(text).some((w) => !SPECIFIC.has(w) && !GENERIC.has(w));
}
