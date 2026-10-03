import { nameSimilarity, SAME_PERSON, type DetectedPatient } from '@vitaldelta/extraction';
import type { NewResult, Profile, Report, Result } from '../storage/types';

/** How closely a report's printed name matches a profile's earlier names (0–1). */
export function profileScore(profile: Profile, name: string | null): number {
  if (!name) return 0;
  return Math.max(0, ...[profile.name, ...profile.aliases].map((n) => nameSimilarity(n, name)));
}

/** The profile a report most likely belongs to, if any is close enough. Only ever a suggestion. */
export function suggestProfile(profiles: Profile[], detected: DetectedPatient): Profile | null {
  let best: { profile: Profile; score: number } | null = null;
  for (const profile of profiles) {
    if (detected.sex && profile.sex && detected.sex !== profile.sex) continue;
    const score = profileScore(profile, detected.name);
    if (score >= SAME_PERSON && (!best || score > best.score)) best = { profile, score };
  }
  return best?.profile ?? null;
}

/** Reasons the chosen profile may not be the person on the report; empty if none. */
export function mismatchReasons(profile: Profile, detected: DetectedPatient): string[] {
  const reasons: string[] = [];
  const known = [profile.name, ...profile.aliases];
  if (detected.name && profile.aliases.length && profileScore(profile, detected.name) < SAME_PERSON) {
    reasons.push(`The report is for “${detected.name}”, but ${profile.name}’s earlier reports say “${known.slice(1).join('”, “') || known[0]}”.`);
  }
  if (detected.sex && profile.sex && detected.sex !== profile.sex) {
    reasons.push(`The report says ${detected.sex}, but ${profile.name}’s earlier reports say ${profile.sex}.`);
  }
  return reasons;
}

/** Share of a new report's recognised values that must match an existing report to call it a duplicate. */
const DUPLICATE_SHARE = 0.8;

/**
 * An existing report of this profile that looks like the same report: same collection
 * date, and either the same file name or mostly identical values.
 */
export function findDuplicate(
  reports: Report[],
  results: Result[],
  draft: { collectedAt: string; sourceFileName: string | null; results: Pick<NewResult, 'markerId' | 'value'>[] },
): Report | null {
  const recognised = draft.results.filter((r) => r.markerId);
  for (const report of reports) {
    if (report.collectedAt !== draft.collectedAt) continue;
    if (draft.sourceFileName && report.sourceFileName === draft.sourceFileName) return report;
    const existing = new Set(results.filter((r) => r.reportId === report.id).map((r) => `${r.markerId}:${r.value}`));
    const same = recognised.filter((r) => existing.has(`${r.markerId}:${r.value}`)).length;
    if (recognised.length && same / recognised.length >= DUPLICATE_SHARE) return report;
  }
  return null;
}
