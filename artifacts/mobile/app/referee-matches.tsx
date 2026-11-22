import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { BrandHeader, EmptyState, LoadingState, Screen, formatRiyadhDateTime } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useColors } from '@/hooks/useColors';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { matchRegistrationMock } from '@/data/matchRegistrationMock';

type RefereeMatch = {
  id: string; venueName: string; neighborhood: string; startsAt: string; durationMinutes: number; liveStatus: string;
  refereeName: string | null; assignmentStatus: 'pending' | 'referee_confirmed' | 'accepted' | 'declined' | null;
  canRespond: boolean; canApply: boolean; applicationStatus: string | null; kind: 'assignment' | 'available';
};

export default function RefereeMatchesScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [matches, setMatches] = useState<RefereeMatch[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => {
    if (isLocalPreviewMode) {
      setMatches([{
        id: matchRegistrationMock.match.id,
        venueName: matchRegistrationMock.match.pitchName,
        neighborhood: matchRegistrationMock.match.area,
        startsAt: matchRegistrationMock.match.startsAt,
        durationMinutes: matchRegistrationMock.match.durationHours * 60,
        liveStatus: 'scheduled',
        refereeName: 'Owner preview',
        assignmentStatus: 'accepted',
        canRespond: false,
        canApply: false,
        applicationStatus: null,
        kind: 'assignment',
      }]);
      setError('');
      setLoading(false);
      return;
    }
    try {
      const token = await getToken();
      const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/referee-matches`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 10_000);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load referee matches.');
      setMatches(result); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load referee matches.'); }
    finally { setLoading(false); }
  }, [getToken]);
  useEffect(() => { void load(); }, [load]);

  const request = async (match: RefereeMatch, decision: 'accept' | 'decline' | 'apply') => {
    setBusyId(match.id);
    try {
      const token = await getToken();
      const response = await fetchWithTimeout(decision === 'apply' ? `${apiBaseUrl}/api/me/referee-applications` : `${apiBaseUrl}/api/me/referee-matches/${match.id}/decision`, {
        method: decision === 'apply' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(decision === 'apply' ? { matchId: match.id } : { decision }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update this referee request.');
      if (decision === 'apply') Alert.alert('Application sent', 'Admins have been notified. If approved, they will contact you to coordinate. Your assignment is final only after you confirm and an admin confirms it.');
      await load();
    } catch (cause) { Alert.alert('Request not updated', cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setBusyId(''); }
  };

  return <Screen refreshing={false} onRefresh={() => { void load(); }}>
    <BrandHeader back subtitle="REFEREE DESK" />
    <Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Referee matches.</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Apply for an open match or respond to an invitation. Live controls unlock after you and an admin confirm the assignment.</Text>
    {loading ? <LoadingState /> : error ? <EmptyState icon="wifi-off" title="Matches unavailable." body={error} action="Try again" onAction={() => void load()} /> : matches.length ? matches.map(match => {
      const invited = match.kind === 'assignment' && match.assignmentStatus === 'pending' && match.canRespond;
      const awaitingAdmin = match.assignmentStatus === 'referee_confirmed';
      const accepted = match.assignmentStatus === 'accepted';
      const available = match.kind === 'available';
      const needsDecision = invited || (available && match.canApply);
      const badge = invited ? 'INVITATION · RESPONSE NEEDED' : awaitingAdmin ? 'YOU CONFIRMED · WAITING FOR ADMIN' : accepted ? `${match.liveStatus.replace('_', ' ').toUpperCase()} · CONFIRMED` : match.applicationStatus === 'pending' ? 'APPLICATION · WAITING FOR ADMIN' : match.applicationStatus === 'invited' ? 'INVITATION SENT' : match.applicationStatus === 'rejected' ? 'APPLICATION DECLINED' : 'OPEN FOR REFEREES';
      const canOpen = accepted;
      return <View key={`${match.kind}-${match.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: needsDecision || awaitingAdmin ? colors.primary : colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={canOpen ? `Open live controls for ${match.venueName}` : `${badge} for ${match.venueName}`} accessibilityState={{ disabled: !canOpen }} disabled={!canOpen} onPress={() => router.push({ pathname: '/referee-match/[id]', params: { id: match.id } })}>
          <View style={styles.cardTop}><View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name={accepted ? 'activity' : available ? 'calendar' : 'clipboard'} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.venue, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{match.neighborhood} · {formatRiyadhDateTime(match.startsAt)} · {match.durationMinutes} min</Text></View>{canOpen ? <Feather name="chevron-right" size={18} color={colors.mutedForeground} /> : null}</View>
          <View style={[styles.phase, { backgroundColor: needsDecision || awaitingAdmin ? colors.accent : colors.secondary }]}><View style={[styles.dot, { backgroundColor: needsDecision || awaitingAdmin ? colors.primary : colors.mutedForeground }]} /><Text style={[styles.phaseText, { color: needsDecision || awaitingAdmin ? colors.primary : colors.mutedForeground }]}>{badge}</Text></View>
          {awaitingAdmin ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>An admin still needs to finalize this assignment before match controls open.</Text> : null}
        </Pressable>
        {needsDecision ? <View style={styles.decisionRow}>
          {invited ? <>
            <Pressable accessibilityRole="button" disabled={busyId === match.id} onPress={() => void request(match, 'accept')} style={[styles.acceptButton, { backgroundColor: colors.primary, opacity: busyId === match.id ? .6 : 1 }]}><Feather name="check" size={15} color={colors.primaryForeground} /><Text style={[styles.acceptText, { color: colors.primaryForeground }]}>{busyId === match.id ? 'Saving…' : 'Confirm availability'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busyId === match.id} onPress={() => void request(match, 'decline')} style={[styles.declineButton, { borderColor: colors.destructive, opacity: busyId === match.id ? .6 : 1 }]}><Text style={[styles.declineText, { color: colors.destructive }]}>Decline</Text></Pressable>
          </> : <Pressable accessibilityRole="button" disabled={busyId === match.id} onPress={() => void request(match, 'apply')} style={[styles.acceptButton, { backgroundColor: colors.primary, opacity: busyId === match.id ? .6 : 1 }]}><Feather name="send" size={14} color={colors.primaryForeground} /><Text style={[styles.acceptText, { color: colors.primaryForeground }]}>{busyId === match.id ? 'Sending…' : 'Apply to referee'}</Text></Pressable>}
        </View> : null}
      </View>;
    }) : <EmptyState icon="calendar" title="No referee matches yet." body="Open matches that include a referee will appear here so you can apply. Admin invitations appear here too." />}
    {!loading && !error ? <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in')} style={[styles.secondaryButton, { borderColor: colors.border }]}><Feather name="camera" size={15} color={colors.primary} /><Text style={[styles.secondaryText, { color: colors.foreground }]}>Open check-in scanner</Text></Pressable> : null}
  </Screen>;
}

const styles = StyleSheet.create({ kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 16 }, title: { fontFamily: 'Georgia', fontSize: 32, marginTop: 7 }, subtitle: { fontSize: 12, lineHeight: 18, marginTop: 7, marginBottom: 18 }, card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 11 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, venue: { fontSize: 14, fontWeight: '800' }, meta: { fontSize: 10, marginTop: 5 }, phase: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, marginTop: 12 }, dot: { width: 6, height: 6, borderRadius: 3 }, phaseText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, hint: { fontSize: 10, lineHeight: 15, marginTop: 9 }, decisionRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, acceptButton: { flex: 1, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, acceptText: { fontSize: 11, fontWeight: '800' }, declineButton: { minWidth: 90, minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, declineText: { fontSize: 10, fontWeight: '800' }, secondaryButton: { minHeight: 46, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }, secondaryText: { fontSize: 11, fontWeight: '700' } });
