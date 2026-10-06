import { markers } from '@vitaldelta/extraction';
import { BACKUP_FORMAT, BACKUP_VERSION, type Backup } from '../storage/backup';
import type { Profile, Report, Result } from '../storage/types';

// Demo mode data. Entirely made up: invented people, invented values chosen to show each
// feature (a value drifting out of range, one coming back, a guideline range, a large
// change, a test not in the dictionary). Never derive anything here from a real report.

export const SAMPLE_LAB = 'Sample Diagnostics (demo)';

type Row = [markerId: string, values: (number | null)[], refLow: number | null, refHigh: number | null];
type WordRow = [name: string, results: (string | null)[], expected: string];
type Person = { id: string; name: string; printedName: string; sex: Profile['sex']; dates: string[]; rows: Row[]; words?: WordRow[] };

const PEOPLE: Person[] = [
  {
    id: 'sample-asha',
    name: 'Asha Rao (sample)',
    printedName: 'ASHA RAO',
    sex: 'female',
    dates: ['2023-02-14', '2023-09-02', '2024-04-20', '2025-01-11'],
    rows: [
      ['718-7', [13.1, 12.6, 12.2, 11.6], 12, 15.5], // Haemoglobin: steady fall, now below
      ['2276-4', [22, 18, 15.5, 12], 15, 150], // Ferritin: steady fall, now below
      ['4548-4', [5.4, 5.5, 5.6, 5.9], null, null], // HbA1c: no printed range, guideline applies
      ['1558-6', [92, 96, 99, 104], 70, 100], // Fasting glucose
      ['2093-3', [186, 192, 204, 219], null, 200], // Total cholesterol
      ['2089-1', [118, 126, 139, 152], null, 130], // LDL
      ['2085-9', [56, 54, 51, 49], 50, null], // HDL
      ['2571-8', [142, 150, 138, 160], null, 150], // Triglycerides
      ['1989-3', [14, 19, 26, 39], 30, 100], // Vitamin D: back in range
      ['3016-3', [2.1, 2.4, 2.2, 2.6], 0.4, 4.2], // TSH: steady
      ['2160-0', [0.8, 0.8, 0.9, 0.85], 0.6, 1.1], // Creatinine
      ['62238-1', [null, 95, 90, 92], null, null], // eGFR: guideline applies
      ['1742-6', [22, 28, 24, 31], 7, 35], // ALT
    ],
    // Results printed as words.
    words: [
      ['HBsAg (Hepatitis B Surface Antigen)', [null, 'Non Reactive', null, 'Non Reactive'], 'Non Reactive'],
      ['Urine Glucose', ['Nil', null, 'Nil', 'Nil'], 'Nil'],
    ],
  },
  {
    id: 'sample-vikram',
    name: 'Vikram Rao (sample)',
    printedName: 'VIKRAM RAO',
    sex: 'male',
    dates: ['2024-06-03', '2025-01-11'],
    rows: [
      ['718-7', [14.8, 15.1], 13, 17],
      ['4548-4', [6.4, 6.1], 4, 5.6],
      ['2089-1', [168, 131], null, 100], // LDL: large drop, still above
      ['2085-9', [38, 42], 40, null], // HDL: back in range
      ['2571-8', [210, 172], null, 150],
      ['2093-3', [238, 205], null, 200],
      ['3016-3', [1.8, 1.9], 0.4, 4.2],
      ['2160-0', [1.1, 1.05], 0.7, 1.3],
      ['62238-1', [78, 81], null, null],
    ],
    words: [['Urine Protein', ['Negative', 'Trace'], 'Negative']], // changed, now differs from expected
  },
];

/** A test the dictionary doesn't know, kept under its printed name. */
const HOMOCYSTEINE = { name: 'Homocysteine', unit: 'µmol/L', values: [null, null, 11.2, 13.4], refLow: 5, refHigh: 15 };

const markerById = new Map(markers.map((m) => [m.id, m]));
const CREATED = '2025-01-12T09:00:00.000Z';

function refText(low: number | null, high: number | null) {
  if (low !== null && high !== null) return `${low} - ${high}`;
  if (high !== null) return `< ${high}`;
  if (low !== null) return `> ${low}`;
  return null;
}

/** The demo's patients and reports, in backup form so it loads through the storage interface. */
export function sampleBackup(): Backup {
  const profiles: Profile[] = [];
  const reports: Report[] = [];
  const results: Result[] = [];

  for (const person of PEOPLE) {
    profiles.push({ id: person.id, name: person.name, aliases: [person.printedName], sex: person.sex, createdAt: CREATED });
    person.dates.forEach((date, i) => {
      const reportId = `${person.id}-${date}`;
      reports.push({
        id: reportId,
        profileId: person.id,
        collectedAt: date,
        labName: SAMPLE_LAB,
        sourceFileName: `sample-report-${date}.pdf`,
        createdAt: CREATED,
      });
      const add = (markerId: string | null, name: string, unit: string, value: number | null | undefined, low: number | null, high: number | null) => {
        if (value === null || value === undefined) return;
        results.push({
          id: `${reportId}-${markerId ?? name}`,
          reportId,
          markerId,
          name,
          value,
          textValue: null,
          expectedText: null,
          method: null,
          unit,
          comparator: null,
          refLow: low,
          refHigh: high,
          labFlag: null,
          confidence: 1,
          userEdited: false,
          original: { valueText: String(value), unit, refText: refText(low, high) },
        });
      };
      for (const [markerId, values, low, high] of person.rows) {
        const marker = markerById.get(markerId)!;
        add(markerId, marker.name, marker.unit, values[i], low, high);
      }
      for (const [name, texts, expected] of person.words ?? []) {
        const text = texts[i];
        if (!text) continue;
        results.push({
          id: `${reportId}-${name}`,
          reportId,
          markerId: null,
          name,
          value: null,
          textValue: text,
          expectedText: expected,
          method: null,
          unit: null,
          comparator: null,
          refLow: null,
          refHigh: null,
          labFlag: null,
          confidence: 1,
          userEdited: false,
          original: { valueText: text, unit: null, refText: expected },
        });
      }
      if (person.id === 'sample-asha') {
        add(null, HOMOCYSTEINE.name, HOMOCYSTEINE.unit, HOMOCYSTEINE.values[i], HOMOCYSTEINE.refLow, HOMOCYSTEINE.refHigh);
      }
    });
  }

  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: CREATED, profiles, reports, results };
}

/** The next report for the first sample patient, as rows for the sample PDF. */
export const NEXT_SAMPLE_REPORT = {
  patient: 'Patient Name : Ms. ASHA RAO   Age/Sex : 41 Y / F',
  date: '12/07/2025',
  rows: [
    ['Haemoglobin', '11.9', 'g/dL', '12.0 - 15.5'],
    ['Ferritin', '19', 'ng/mL', '15 - 150'],
    ['HbA1c', '5.8', '%', ''],
    ['Fasting Blood Sugar', '101', 'mg/dL', '70 - 100'],
    ['Total Cholesterol', '211', 'mg/dL', '< 200'],
    ['LDL Cholesterol', '144', 'mg/dL', '< 130'],
    ['HDL Cholesterol', '50', 'mg/dL', '> 50'],
    ['Triglycerides', '149', 'mg/dL', '< 150'],
    ['Vitamin D (25-OH)', '42', 'ng/mL', '30 - 100'],
    ['TSH', '2.3', 'uIU/mL', '0.4 - 4.2'],
    ['Creatinine', '0.86', 'mg/dL', '0.6 - 1.1'],
    ['SGPT (ALT)', '27', 'U/L', '7 - 35'],
    ['Homocysteine', '12.8', 'umol/L', '5 - 15'],
    ['HBsAg (Hepatitis B Surface Antigen)', 'Non Reactive', 'Non Reactive'],
    ['Urine Glucose', 'Nil', 'Nil'],
  ],
};
