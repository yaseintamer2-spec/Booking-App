import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { IconBadge, type AccentTone } from '@/components/IconBadge';

export const PLAYER_POSITIONS = [
  { value: 'striker', label: 'Striker', short: 'ST', icon: 'target', detail: 'Lead the attack' },
  { value: 'defender', label: 'Defender', short: 'DF', icon: 'shield', detail: 'Hold the back line' },
  { value: 'midfielder', label: 'Midfielder', short: 'MF', icon: 'repeat', detail: 'Link up the play' },
  { value: 'winger', label: 'Winger', short: 'WG', icon: 'wind', detail: 'Bring pace out wide' },
] as const;

export type PlayerPosition = typeof PLAYER_POSITIONS[number]['value'];
export const isPlayerPosition = (value: unknown): value is PlayerPosition => PLAYER_POSITIONS.some(position => position.value === value);
export const getPlayerPosition = (value: string | null | undefined) => PLAYER_POSITIONS.find(position => position.value === value) ?? null;

export function PreferredPositionPicker({ selected, onSelect }: { selected: PlayerPosition; onSelect: (position: PlayerPosition) => void }) {
  const colors = useColors();
  const tones: Record<PlayerPosition, AccentTone> = { striker: 'pink', defender: 'cyan', midfielder: 'yellow', winger: 'orange' };
  return <View style={styles.grid}>
    {PLAYER_POSITIONS.map(position => {
      const active = selected === position.value;
      return <Pressable
        key={position.value}
        accessibilityRole="button"
        accessibilityLabel={`${position.label}, ${position.detail}`}
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(position.value)}
        style={({ pressed }) => [styles.option, { backgroundColor: active ? `${colors[tones[position.value]]}12` : colors.card, borderColor: active ? colors[tones[position.value]] : colors.border, opacity: pressed ? .78 : 1 }]}
      >
        <View style={styles.optionTop}><IconBadge name={position.icon as React.ComponentProps<typeof Feather>['name']} tone={tones[position.value]} size="medium" />{active ? <View style={[styles.selectedMark, { backgroundColor: colors[tones[position.value]] }]}><Feather name="check" size={11} color={colors.background} /></View> : <View style={[styles.unselectedMark, { borderColor: colors.border }]} />}</View>
        <View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.foreground }]}>{position.label}</Text><Text style={[styles.optionDetail, { color: colors.mutedForeground }]}>{position.detail}</Text></View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  option: { minHeight: 112, flexGrow: 1, flexBasis: '47%', borderWidth: 1, borderRadius: 19, paddingHorizontal: 13, paddingVertical: 12, justifyContent: 'space-between', gap: 11 },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedMark: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  unselectedMark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  optionCopy: { gap: 4 },
  optionTitle: { fontSize: 13, fontWeight: '900' },
  optionDetail: { fontSize: 9, lineHeight: 13 },
  badge: { minWidth: 27, height: 19, borderRadius: 8, paddingHorizontal: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: .2 },
});

