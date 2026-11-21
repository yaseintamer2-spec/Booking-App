import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export const PLAYER_POSITIONS = [
  { value: 'striker', label: 'Striker', short: 'ST', icon: 'soccer', detail: 'Lead the attack' },
  { value: 'defender', label: 'Defender', short: 'DF', icon: 'shield-check', detail: 'Hold the back line' },
  { value: 'midfielder', label: 'Midfielder', short: 'MF', icon: 'transfer', detail: 'Link up the play' },
  { value: 'winger', label: 'Winger', short: 'WG', icon: 'run-fast', detail: 'Bring pace out wide' },
] as const;

export type PlayerPosition = typeof PLAYER_POSITIONS[number]['value'];
export const isPlayerPosition = (value: unknown): value is PlayerPosition => PLAYER_POSITIONS.some(position => position.value === value);
export const getPlayerPosition = (value: string | null | undefined) => PLAYER_POSITIONS.find(position => position.value === value) ?? null;

export function PreferredPositionPicker({ selected, onSelect }: { selected: PlayerPosition; onSelect: (position: PlayerPosition) => void }) {
  const colors = useColors();
  return <View style={styles.grid}>
    {PLAYER_POSITIONS.map(position => {
      const active = selected === position.value;
      return <Pressable
        key={position.value}
        accessibilityRole="button"
        accessibilityLabel={`${position.label}, ${position.detail}`}
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(position.value)}
        style={({ pressed }) => [styles.option, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.primary : colors.border, opacity: pressed ? .78 : 1 }]}
      >
        <View style={[styles.optionIcon, { backgroundColor: active ? colors.primary : colors.secondary }]}><MaterialCommunityIcons name={position.icon} size={22} color={active ? colors.primaryForeground : colors.primary} /></View>
        <View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.foreground }]}>{position.label}</Text><Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>{position.detail}</Text></View>
        {active ? <Feather name="check-circle" size={17} color={colors.primary} /> : null}
      </Pressable>;
    })}
  </View>;
}

export function PositionBadge({ position, style }: { position: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const info = getPlayerPosition(position);
  if (!info) return null;
  return <View accessibilityLabel={`Preferred position: ${info.label}`} style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.background }, style]}><Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{info.short}</Text></View>;
}

const styles = StyleSheet.create({
  grid: { gap: 9 },
  option: { minHeight: 70, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 12, fontWeight: '800' },
  optionDetail: { fontSize: 9, marginTop: 3 },
  badge: { minWidth: 27, height: 19, borderRadius: 8, paddingHorizontal: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: .2 },
});
