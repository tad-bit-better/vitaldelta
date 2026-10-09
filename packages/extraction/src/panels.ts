/**
 * How tests are grouped on screen: small panels ("Bilirubin") inside the report types labs
 * sell ("Liver function test"). Display only; extraction never uses it. Every marker in the
 * dictionary belongs to exactly one panel (panels.test.ts checks).
 */
export type Panel = {
  id: string;
  /** Section heading, e.g. "Liver enzymes". */
  label: string;
  /** The report type it's part of, e.g. "Liver function test". */
  family: string;
  /** Marker ids (LOINC), in the order shown. */
  markers: string[];
};

export const panels: Panel[] = [
  { id: 'red-cells', label: 'Red blood cells', family: 'Complete blood count', markers: ['718-7', '4544-3', '789-8', '787-2', '785-6', '786-4', '788-0'] },
  { id: 'white-cells', label: 'White blood cells', family: 'Complete blood count', markers: ['6690-2', '770-8', '736-9', '5905-5', '713-8', '706-2', '751-8', '731-0', '742-7', '711-2', '704-7'] },
  { id: 'platelets', label: 'Platelets', family: 'Complete blood count', markers: ['777-3', '32623-1', '32207-3', '51631-0', '51637-7'] },
  { id: 'sugar', label: 'Blood sugar', family: 'Blood sugar', markers: ['1558-6', '2345-7', '4548-4'] },
  { id: 'lipids', label: 'Lipids', family: 'Lipid profile', markers: ['2093-3', '2085-9', '2089-1', '2571-8', '13458-5', '43396-1', '9830-1', '11054-4'] },
  { id: 'liver-enzymes', label: 'Liver enzymes', family: 'Liver function test', markers: ['1742-6', '1920-8', '6768-6', '2324-2'] },
  { id: 'bilirubin', label: 'Bilirubin', family: 'Liver function test', markers: ['1975-2', '1968-7', '1971-1'] },
  { id: 'proteins', label: 'Proteins', family: 'Liver function test', markers: ['2885-2', '1751-7', '10834-0', '1759-0'] },
  { id: 'kidney', label: 'Kidney', family: 'Kidney function test', markers: ['2160-0', '3091-6', '3094-0', '3097-3', '3084-1', '98979-8'] },
  { id: 'electrolytes', label: 'Electrolytes', family: 'Electrolytes', markers: ['2951-2', '2823-3', '2075-0'] },
  { id: 'minerals', label: 'Minerals', family: 'Minerals', markers: ['17861-6', '2777-1', '19123-9'] },
  { id: 'thyroid', label: 'Thyroid', family: 'Thyroid profile', markers: ['3016-3', '3024-7', '3051-0', '3026-2', '3053-6'] },
  { id: 'iron', label: 'Iron', family: 'Iron studies', markers: ['2276-4', '2498-4', '2500-7', '2501-5', '2502-3'] },
  { id: 'vitamins', label: 'Vitamins', family: 'Vitamins', markers: ['62292-8', '2132-9'] },
  { id: 'inflammation', label: 'Inflammation', family: 'Inflammation markers', markers: ['30341-2', '1988-5', '30522-7'] },
];

const panelOf = new Map(panels.flatMap((p) => p.markers.map((id) => [id, p] as const)));

/** The panel a marker is shown in, or null for tests not in the dictionary. */
export function panelFor(markerId: string | null): Panel | null {
  return markerId ? (panelOf.get(markerId) ?? null) : null;
}

/** Position of a marker within its panel and of the panel among panels, for sorting. */
export function panelOrder(markerId: string | null): number {
  const panel = panelFor(markerId);
  if (!panel || !markerId) return Number.MAX_SAFE_INTEGER;
  return panels.indexOf(panel) * 100 + panel.markers.indexOf(markerId);
}
