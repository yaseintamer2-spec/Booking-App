import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  return <Screen><BrandHeader user={user.data} subtitle="PLAYER CARD" /><Text style={[styles.kicker, { color: colors.primary }]}>YOUR KICKOFF PROFILE</Text><Text style={[styles.title, { color: colors.foreground }]}>Player profile.</Text>
    <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.initial, { color: colors.primary }]}>{(user.data?.name || 'K').slice(0, 1).toUpperCase()}</Text></View><Text style={[styles.name, { color: colors.foreground }]}>{user.data?.name || 'Player'}</Text><Text style={[styles.email, { color: colors.mutedForeground }]}>{user.data?.email || ' '}</Text><View style={[styles.line, { backgroundColor: colors.border }]} /><View style={styles.info}><Feather name="map-pin" size={15} color={colors.primary} /><Text style={[styles.email, { color: colors.mutedForeground }]}>Riyadh, Saudi Arabia</Text></View><View style={styles.info}><Feather name="users" size={15} color={colors.primary} /><Text style={[styles.email, { color: colors.mutedForeground }]}>7v7 player</Text></View></View>
    <Pressable onPress={() => router.push('/settings')} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="settings" size={17} color={colors.mutedForeground} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Account settings</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>
    <EmptyState icon="bar-chart-2" title="Your stats start on the pitch." body="Match history and player performance will be connected here as the product's player activity API becomes available." />
  </Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 }, title: { fontSize: 35, fontFamily: 'Georgia', marginTop: 8 }, profileCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', marginTop: 21 }, avatar: { width: 66, height: 66, borderRadius: 23, alignItems: 'center', justifyContent: 'center' }, initial: { fontSize: 25, fontWeight: '700' }, name: { fontSize: 18, fontFamily: 'Georgia', marginTop: 12 }, email: { fontSize: 12, marginTop: 4 }, line: { height: 1, width: '100%', marginVertical: 18 }, info: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', marginBottom: 10 }, settingsRow: { borderBottomWidth: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }, settingsText: { flex: 1, fontSize: 13, fontWeight: '600' } });
