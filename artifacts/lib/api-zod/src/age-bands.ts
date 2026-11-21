export const MATCH_AGE_GROUPS = ['13-16', '16-20', '20+'] as const;
export type MatchAgeGroup = typeof MATCH_AGE_GROUPS[number];

export const MATCH_AGE_BOUNDS: Record<MatchAgeGroup, { min: number; max: number | null }> = {
  '13-16': { min: 13, max: 16 },
  '16-20': { min: 16, max: 20 },
  '20+': { min: 20, max: null },
};

export function isMatchAgeGroup(value: unknown): value is MatchAgeGroup {
  return typeof value === 'string' && MATCH_AGE_GROUPS.includes(value as MatchAgeGroup);
}

export function getRecommendedMatchAgeGroup(age: number): MatchAgeGroup | null {
  if (!Number.isInteger(age) || age < 13 || age > 120) return null;
  if (age <= 16) return '13-16';
  if (age < 20) return '16-20';
  return '20+';
}

export function isAgeEligibleForMatch(age: number | null | undefined, group: MatchAgeGroup): boolean {
  if (typeof age !== 'number' || !Number.isInteger(age)) return false;
  const { min, max } = MATCH_AGE_BOUNDS[group];
  return age >= min && (max === null || age <= max);
}

export function matchAgeGroupLabel(group: MatchAgeGroup): string {
  return group === '20+' ? '20+' : group.replace('-', '–');
}
