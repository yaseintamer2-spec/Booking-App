import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MATCH_AGE_GROUPS, type MatchAgeGroup, matchAgeGroupLabel } from '@/lib/matchAge';
import { useColors } from '@/hooks/useColors';

export function MatchAgeGroupPicker({ value, onChange }: { value: MatchAgeGroup; onChange: (value: MatchAgeGroup) => void }) {
  const colors = useColors();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
    {MATCH_AGE_GROUPS.map((group) => <Pressable key={group} accessibilityRole="button" accessibilityState={{ selected: group === value }} onPress={() => onChange(group)} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderRadius: 22, borderColor: group === value ? colors.primary : colors.border, backgroundColor: group === value ? colors.accent : colors.card }}><Text style={{ fontSize: 12, fontWeight: '800', color: group === value ? colors.primary : colors.foreground }}>AGES {matchAgeGroupLabel(group)}</Text></Pressable>)}
  </View>;
}
