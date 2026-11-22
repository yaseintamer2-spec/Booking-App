import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type AccentTone = 'primary' | 'pink' | 'orange' | 'yellow' | 'cyan' | 'violet' | 'destructive';
type Props = {
  name: React.ComponentProps<typeof Feather>['name'];
  tone?: AccentTone;
  size?: 'small' | 'medium' | 'large';
};

const dimensions = { small: 30, medium: 40, large: 52 } as const;
const glyphSizes = { small: 14, medium: 18, large: 23 } as const;

/** A consistent rounded icon tile with an independently chosen accent color. */
export function IconBadge({ name, tone = 'primary', size = 'medium' }: Props) {
  const colors = useColors();
  const color = colors[tone];
  const dimension = dimensions[size];
  return <View style={[styles.tile, { width: dimension, height: dimension, borderRadius: dimension * 0.34, backgroundColor: `${color}22`, borderColor: `${color}44` }]}>
    <Feather name={name} size={glyphSizes[size]} color={color} />
  </View>;
}

const styles = StyleSheet.create({ tile: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' } });

