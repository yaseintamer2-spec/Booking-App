export const MATCH_AGE_GROUPS = ['13-16', '16-20', '20+'] as const;
export type MatchAgeGroup = typeof MATCH_AGE_GROUPS[number];
export function matchAgeGroupLabel(group: MatchAgeGroup) { return group === '20+' ? group : group.replace('-', '–'); }
export function getRecommendedMatchAgeGroup(age: number): MatchAgeGroup | null {
  if (!Number.isInteger(age) || age < 13 || age > 120) return null;
  if (age <= 16) return '13-16';
  if (age < 20) return '16-20';
  return '20+';
}
