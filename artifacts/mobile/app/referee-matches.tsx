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
import { IconBadge } from '@/components/IconBadge';

type RefereeMatch = {
  id: string; venueName: string; neighborhood: string; startsAt: string; durationMinutes: number; liveStatus: string;
  refereeName: string | null; assignmentStatus: 'pending' | 'referee_confirmed' | 'accepted' | 'declined' | null;
  canRespond: boolean; canApply: boolean; applicationStatus: string | null; kind: 'assignment' | 'available';
};

export default function RefereeMatchesScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken } = useAuth();
  const [matches, setMatches] = useState<RefereeMatch[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [filter, setFilter] = useState<'all' | 'action' | 'confirmed'>('all');
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

  const needsAction = (match: RefereeMatch) => (match.kind === 'assignment' && match.assignmentStatus === 'pending' && match.canRespond) || (match.kind === 'available' && match.canApply);
  const confirmedMatches = matches.filter((match) => match.assignmentStatus === 'accepted');
  const actionMatches = matches.filter(needsAction);
  const visibleMatches = filter === 'action' ? actionMatches : filter === 'confirmed' ? confirmedMatches : matches;

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
    <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.heroTop}><IconBadge name="activity" tone="orange" size="large" /><View style={[styles.heroTag, { backgroundColor: `${colors.pink}20` }]}><Text style={[styles.heroTagText, { color: colors.pink }]}>REFEREE DESK</Text></View></View>
      <Text style={[styles.kicker, { color: colors.primary }]}>MATCH DAY</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Your match desk.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Invitations, applications, and live controls in one place.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in')} style={({ pressed }) => [styles.scanButton, { backgroundColor: colors.primary, opacity: pressed ? .82 : 1 }]}><Feather name="camera" size={16} color={colors.primaryForeground} /><Text style={{ color: colors.primaryForeground, fontSize: 12, fontWeight: '800' }}>Scan player check-in</Text><Feather name="arrow-up-right" size={14} color={colors.primaryForeground} /></Pressable>
    </View>
    <View style={styles.quickStats}>
      <QuickStat label="Needs action" value={String(actionMatches.length)} tone={colors.orange} icon="bell" colors={colors} />
      <QuickStat label="Confirmed" value={String(confirmedMatches.length)} tone={colors.primary} icon="check-circle" colors={colors} />
      <QuickStat label="Open matches" value={String(matches.filter((match) => match.kind === 'available' && match.canApply).length)} tone={colors.cyan} icon="calendar" colors={colors} />
    </View>
    <View style={styles.filterRow}>{([['all', `All · ${matches.length}`], ['action', `Needs action · ${actionMatches.length}`], ['confirmed', `Confirmed · ${confirmedMatches.length}`]] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.filterChip, { backgroundColor: filter === key ? colors.primary : colors.card, borderColor: filter === key ? colors.primary : colors.border }]}><Text style={[styles.filterText, { color: filter === key ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text></Pressable>)}</View>
    {loading ? <LoadingState /> : error ? <EmptyState icon="wifi-off" title="Matches unavailable." body={error} action="Try again" onAction={() => void load()} /> : visibleMatches.length ? visibleMatches.map(match => {
      const invited = match.kind === 'assignment' && match.assignmentStatus === 'pending' && match.canRespond;
      const awaitingAdmin = match.assignmentStatus === 'referee_confirmed';
      const accepted = match.assignmentStatus === 'accepted';
      const available = match.kind === 'available';
      const needsDecision = invited || (available && match.canApply);
      const badge = invited ? 'INVITATION · RESPONSE NEEDED' : awaitingAdmin ? 'YOU CONFIRMED · WAITING FOR ADMIN' : accepted ? `${match.liveStatus.replace('_', ' ').toUpperCase()} · CONFIRMED` : match.applicationStatus === 'pending' ? 'APPLICATION · WAITING FOR ADMIN' : match.applicationStatus === 'invited' ? 'INVITATION SENT' : match.applicationStatus === 'rejected' ? 'APPLICATION DECLINED' : 'OPEN FOR REFEREES';
      const canOpen = accepted;
      return <View key={`${match.kind}-${match.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: needsDecision || awaitingAdmin ? colors.primary : colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={canOpen ? `Open live controls for ${match.venueName}` : `${badge} for ${match.venueName}`} accessibilityState={{ disabled: !canOpen }} disabled={!canOpen} onPress={() => router.push({ pathname: '/referee-match/[id]', params: { id: match.id } })}>
          <View style={styles.cardTop}><IconBadge name={accepted ? 'activity' : available ? 'calendar' : 'clipboard'} tone={accepted ? 'primary' : available ? 'cyan' : 'orange'} /><View style={{ flex: 1 }}><Text style={[styles.venue, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{match.neighborhood} · {formatRiyadhDateTime(match.startsAt)} · {match.durationMinutes} min</Text></View>{canOpen ? <Feather name="chevron-right" size={18} color={colors.mutedForeground} /> : null}</View>
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
    }) : <EmptyState icon="calendar" title={filter === 'all' ? 'No referee matches yet.' : 'Nothing in this view yet.'} body={filter === 'all' ? 'Open matches that include a referee will appear here so you can apply. Admin invitations appear here too.' : 'Switch to All to see every referee match and invitation.'} />}
  </Screen>;
}

function QuickStat({ label, value, tone, icon, colors }: { label: string; value: string; tone: string; icon: React.ComponentProps<typeof Feather>['name']; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.quickStat, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.statIcon, { backgroundColor: `${tone}20` }]}><Feather name={icon} size={14} color={tone} /></View><Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text><Text numberOfLines={1} style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({ kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 15 }, title: { fontFamily: 'Georgia', fontSize: 30, marginTop: 7 }, subtitle: { fontSize: 11, lineHeight: 17, marginTop: 7 }, hero: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 8 }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroTag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 }, heroTagText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 }, scanButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }, quickStats: { flexDirection: 'row', gap: 8, marginTop: 10 }, quickStat: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 15, padding: 10 }, statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, statValue: { fontSize: 20, fontWeight: '900', marginTop: 8 }, statLabel: { fontSize: 9, fontWeight: '700', marginTop: 2 }, filterRow: { flexDirection: 'row', gap: 7, marginTop: 14, marginBottom: 12 }, filterChip: { minHeight: 38, paddingHorizontal: 11, borderWidth: 1, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, filterText: { fontSize: 9, fontWeight: '800' }, card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 11 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 }, icon: { height: 42, width: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, venue: { fontSize: 14, fontWeight: '800' }, meta: { fontSize: 10, marginTop: 5 }, phase: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 20, marginTop: 12 }, dot: { width: 6, height: 6, borderRadius: 3 }, phaseText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7 }, hint: { fontSize: 10, lineHeight: 15, marginTop: 9 }, decisionRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, acceptButton: { flex: 1, minHeight: 46, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, acceptText: { fontSize: 11, fontWeight: '800' }, declineButton: { minWidth: 90, minHeight: 46, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, declineText: { fontSize: 10, fontWeight: '800' } });
