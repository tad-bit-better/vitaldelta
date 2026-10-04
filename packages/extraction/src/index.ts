export const version = '0.0.1';

export type { Row, TextItem } from './types';
export { groupRows, type GroupRowsOptions } from './rows';
export { fromPdfJsItem, type PdfJsTextItem, type ToViewportPoint } from './pdfjs';
export { parseNumber, parseRow, type Comparator, type ParsedRow } from './parse';
export { markers, type Guideline, type GuidelineBounds, type Marker } from './dictionary';
export { nameKey } from './names';
export { canonicalUnit, convert, type Conversion } from './units';
export { createMatcher, matchMarker, type MarkerMatch } from './match';
export { extractResults, REVIEW_THRESHOLD, type ExtractedResult, type Issue } from './extract';
export { extractWordResults, hasWordResults, sameWord, wordStatus, type ExtractedWordResult, type WordStatus } from './words';
export { detectReportDate, findDate, type DetectedDate } from './reportDate';
export { detectDrift, type Drift, type DriftOptions } from './trends';
export { detectPatient, nameSimilarity, SAME_PERSON, type DetectedPatient, type Sex } from './patient';
export { describeStatus, NEAR_FRACTION, percentChange, percentOutside, rangeName, rangeStatus, type RangedValue, type RangeSource, type RangeStatus } from './flags';
export { effectiveRange, type EffectiveRange } from './guideline';
