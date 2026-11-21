import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { BrandHeader, EmptyState, LoadingState, Screen, formatRiyadhDateTime } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';

type RefereeMatch = { id: string; venueName: string; neighborhood: string; startsAt: string; durationMinutes: number; liveStatus: string; refereeName: string | null };

export default function RefereeMatchesScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [matches, setMatches] = useState<RefereeMatch[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/api/me/referee-matches`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your assigned matches.');
      setMatches(result); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your assigned matches.'); }
    finally { setLoading(false); }
  }, [getToken]);
  useEffect(() => { void load(); }, [load]);

  return <Screen refreshing={false} onRefresh={() => { void load(); }}>
    <BrandHeader back subtitle="REFEREE DESK" />
    <Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Your matches.</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Open an assigned match to manage the clock, score, and goal timeline.</Text>
    {loading ? <LoadingState /> : error ? <EmptyState icon="wifi-off" title="Matches unavailable." body={error} action="Try again" onAction={() => void load()} /> : matches.length ? matches.map(match => <Pressable key={match.id} accessibilityRole="button" accessibilityLabel={`Open live controls for ${match.venueName}`} onPress={() => router.push({ pathname: '/referee-match/[id]', params: { id: match.id } })} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}><View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="activity" size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.venue, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{match.neighborhood} · {formatRiyadhDateTime(match.startsAt)}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></View>
      <View style={[styles.phase, { backgroundColor: match.liveStatus === 'scheduled' ? colors.secondary : colors.accent }]}><View style={[styles.dot, { backgroundColor: match.liveStatus === 'scheduled' ? colors.mutedForeground : colors.primary }]} /><Text style={[styles.phaseText, { color: match.liveStatus === 'scheduled' ? colors.mutedForeground : colors.primary }]}>{match.liveStatus.replace('_', ' ').toUpperCase()}</Text></View>
    </Pressable>) : <EmptyState icon="calendar" title="No assigned matches yet." body="When an admin assigns you as referee, that match will show here." />}
    {!loading && !error ? <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in')} style={[styles.secondaryButton, { borderColor: colors.border }]}><Feather name="camera" size={15} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>Open check-in scanner</Text></Pressable> : null}
  </Screen>;
}

const styles = StyleSheet.create({ kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 16 }, title: { fontFamily: 'Georgia', fontSize: 32, marginTop: 7 }, subtitle: { fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 18 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 11 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, venue: { fontSize: 14, fontWeight: '800' }, meta: { fontSize: 10, marginTop: 5 }, phase: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, marginTop: 12 }, dot: { width: 6, height: 6, borderRadius: 3 }, phaseText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }, secondaryText: { fontSize: 11, fontWeight: '700' } });
