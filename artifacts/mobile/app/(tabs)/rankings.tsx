import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function RankingsScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  useEffect(() => { if (user.error) router.replace('/(auth)/welcome'); }, [user.error, router]);
  return <Screen><BrandHeader user={user.data} subtitle="RIYADH LEADERBOARD" /><Text style={[styles.kicker, { color: colors.primary }]}>THE CITY'S BEST</Text><Text style={[styles.title, { color: colors.foreground }]}>Rankings.</Text>
    <View style={[styles.period, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="trending-up" size={18} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.periodTitle, { color: colors.foreground }]}>A league worth joining</Text><Text style={[styles.periodCopy, { color: colors.mutedForeground }]}>Player rankings will come into focus as the community grows.</Text></View></View>
    <EmptyState icon="award" title="The table is still taking shape." body="Rankings will be based on real match activity. No points or players are made up." />
  </Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 }, title: { fontSize: 35, fontFamily: 'Georgia', marginTop: 8 }, period: { marginTop: 22, borderWidth: 1, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, periodTitle: { fontSize: 13, fontWeight: '700' }, periodCopy: { fontSize: 11, lineHeight: 16, marginTop: 4 } });
