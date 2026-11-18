import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function MyMatchesScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  return <Screen><BrandHeader user={user.data} subtitle="YOUR SCHEDULE" /><Text style={[styles.kicker, { color: colors.primary }]}>THE LINE-UP</Text><Text style={[styles.title, { color: colors.foreground }]}>My matches</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>Your upcoming time on the pitch.</Text><EmptyState icon="calendar" title="Nothing booked. Yet." body="Your confirmed match schedule will live here. Browse open games and find one that fits." action="Discover matches" onAction={() => router.push('/(tabs)/matches')} /></Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 }, title: { fontSize: 34, fontFamily: 'Georgia', marginTop: 8 }, sub: { fontSize: 13, marginTop: 7, marginBottom: 19 } });
