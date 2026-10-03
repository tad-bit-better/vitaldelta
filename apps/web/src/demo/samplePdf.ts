import { NEXT_SAMPLE_REPORT } from './sampleData';

// Builds a small, made-up lab report PDF in the browser for demo mode, so the real
// upload → extract → review flow can be tried without a real report. Plain PDF 1.4 with
// one page of Helvetica text laid out in columns like a typical lab report.

/** PDF literal strings need backslashes and parentheses escaped. */
const pdfText = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function samplePdfBytes(report = NEXT_SAMPLE_REPORT): Uint8Array<ArrayBuffer> {
  const lines: string[][] = [
    ['Sample Diagnostics (demo) - made-up report for trying VitalDelta'],
    [report.patient],
    [`Sample Collected On : ${report.date}`],
    ['Test Name', 'Result', 'Unit', 'Reference Range'],
    ...report.rows,
  ];
  const xs = [40, 220, 300, 400];
  let y = 740;
  let ops = 'BT /F1 10 Tf ';
  for (const line of lines) {
    line.forEach((t, i) => (ops += `1 0 0 1 ${xs[i]} ${y} Tm (${pdfText(t)}) Tj `));
    y -= 18;
  }
  ops += 'ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // ASCII only, so string length equals byte length (the xref offsets rely on it).
  return new TextEncoder().encode(out);
}

export function samplePdfFile(): File {
  return new File([samplePdfBytes()], 'sample-report-2025-07-12.pdf', { type: 'application/pdf' });
}
