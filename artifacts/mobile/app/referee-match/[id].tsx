import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';

type Team = 'red' | 'blue';
type Player = { userId: string; firstName: string; avatarUrl: string | null; pitchSlot: number | null; team: Team };
type Goal = { id: string; clientEventId: string; type: 'goal'; team: Team; period: number; minute: number; scorerUserId: string; scorerName: string; assistUserId: string | null; assistName: string | null; createdAt: string };
type PendingGoal = { clientEventId: string; team: Team; scorerUserId: string; assistUserId: string | null; occurredAt: string };
type LiveSnapshot = { id: string; venueName: string; neighborhood: string; durationMinutes: number; refereeUserId: string | null; refereeName: string | null; liveStatus: 'scheduled' | 'first_half' | 'halftime' | 'second_half' | 'full_time'; liveStartedAt: string | null; livePhaseStartedAt: string | null; liveFirstHalfEndedAt: string | null; liveSecondHalfStartedAt: string | null; liveEndedAt: string | null; score: { red: number; blue: number }; players: Player[]; events: Goal[] };
const RED = '#FF5364';
const BLUE = '#579BFF';

export default function RefereeMatchScreen() {
  const colors = useColors(); const { getToken } = useAuth();
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const matchId = Array.isArray(routeId) ? routeId[0] : routeId;
  const queueKey = `kickoff:match-live-events:${matchId}`;
  const [match, setMatch] = useState<LiveSnapshot | null>(null);
  const [queue, setQueue] = useState<PendingGoal[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [scorerId, setScorerId] = useState('');
  const [assistId, setAssistId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const syncing = useRef(false);
  const hasSnapshot = useRef(false);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.error || 'Could not update the live match.');
    return result;
  }, [getToken]);

  const syncLive = useCallback(async () => {
    if (!matchId || syncing.current) return;
    syncing.current = true;
    try {
      const storedQueue = JSON.parse(await AsyncStorage.getItem(queueKey) || '[]') as PendingGoal[];
      setQueue(storedQueue);
      const snapshot = await request(`/matches/${matchId}/live`) as LiveSnapshot;
      setMatch(snapshot); hasSnapshot.current = true; setError('');
      let pending = JSON.parse(await AsyncStorage.getItem(queueKey) || '[]') as PendingGoal[];
      const serverIds = new Set(snapshot.events.map(event => event.clientEventId));
      pending = pending.filter(goal => !serverIds.has(goal.clientEventId));
      await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending);
      for (const goal of pending) {
        try {
          const latest = await request(`/matches/${matchId}/live/events`, { method: 'POST', body: JSON.stringify(goal) }) as LiveSnapshot;
          pending = pending.filter(item => item.clientEventId !== goal.clientEventId);
          await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending); setMatch(latest);
          setNotice('Queued goal synced. Players can see the updated score.');
        } catch {
          setNotice('Connection paused. Goal saved on this phone and will sync when you reconnect.');
          break;
        }
      }
    } catch (cause) {
      if (!hasSnapshot.current) setError(cause instanceof Error ? cause.message : 'Could not load this match.');
      else setNotice('Trying to reconnect. New changes will sync when the connection returns.');
    } finally { setLoading(false); syncing.current = false; }
  }, [matchId, queueKey, request]);

  useFocusEffect(useCallback(() => {
    void syncLive();
    const timer = setInterval(() => { void syncLive(); }, 3000);
    return () => clearInterval(timer);
  }, [syncLive]));

  const roster = useMemo(() => match?.players.filter(player => player.team === team) ?? [], [match?.players, team]);
  const scorer = roster.find(player => player.userId === scorerId);
  const assistant = roster.find(player => player.userId === assistId);
  const phaseAction = match?.liveStatus === 'scheduled' ? { action: 'start_first_half', label: 'Start first half', icon: 'play' }
    : match?.liveStatus === 'first_half' ? { action: 'start_halftime', label: 'Start half-time break', icon: 'pause' }
      : match?.liveStatus === 'halftime' ? { action: 'start_second_half', label: 'Start second half', icon: 'play' }
        : match?.liveStatus === 'second_half' ? { action: 'finish_match', label: 'Finish match · full time', icon: 'flag' } : null;
  const visibleServerIds = new Set(match?.events.map(event => event.clientEventId) ?? []);
  const pendingRed = queue.filter(goal => goal.team === 'red' && !visibleServerIds.has(goal.clientEventId)).length;
  const pendingBlue = queue.filter(goal => goal.team === 'blue' && !visibleServerIds.has(goal.clientEventId)).length;
  const displayClock = () => {
    if (!match?.livePhaseStartedAt || (match.liveStatus !== 'first_half' && match.liveStatus !== 'second_half')) return match?.liveStatus === 'halftime' ? `${Math.ceil(match.durationMinutes / 2)}′` : '00′';
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(match.livePhaseStartedAt).getTime()) / 60_000));
    return `${(match.liveStatus === 'second_half' ? Math.ceil(match.durationMinutes / 2) : 0) + elapsed}′`;
  };

  const changePhase = async () => {
    if (!match || !phaseAction || busy) return;
    setBusy(true); setNotice('');
    try {
      const latest = await request(`/matches/${match.id}/live/state`, { method: 'POST', body: JSON.stringify({ action: phaseAction.action }) }) as LiveSnapshot;
      setMatch(latest); hasSnapshot.current = true; setNotice(phaseAction.action === 'finish_match' ? 'Full time. Final score saved.' : `${phaseAction.label} recorded.`);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not update the match phase. Check your connection.'); }
    finally { setBusy(false); }
  };

  const recordGoal = async () => {
    if (!match || !team || !scorer || busy || !['first_half', 'second_half'].includes(match.liveStatus)) return;
    setBusy(true); setNotice('');
    const goal: PendingGoal = { clientEventId: Crypto.randomUUID(), team, scorerUserId: scorer.userId, assistUserId: assistant?.userId ?? null, occurredAt: new Date().toISOString() };
    const pending = [...queue, goal];
    try {
      await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending);
    } catch {
      setNotice('Could not save this goal on the phone. Please try again.'); setBusy(false); return;
    }
    try {
      setNotice('Goal saved on this phone. Syncing live score…');
      const latest = await request(`/matches/${match.id}/live/events`, { method: 'POST', body: JSON.stringify(goal) }) as LiveSnapshot;
      const remaining = pending.filter(item => item.clientEventId !== goal.clientEventId);
      await AsyncStorage.setItem(queueKey, JSON.stringify(remaining)); setQueue(remaining); setMatch(latest); hasSnapshot.current = true;
      setNotice('Goal added. The live score is updated.'); setScorerId(''); setAssistId('');
    } catch {
      setNotice('Connection paused. Goal saved on this phone and will sync when you reconnect.');
    } finally { setBusy(false); }
  };

  const undoGoal = async (event: Goal) => {
    if (!match || busy) return;
    setBusy(true); setNotice('');
    try {
      const latest = await request(`/matches/${match.id}/live/events/${event.id}`, { method: 'DELETE' }) as LiveSnapshot;
      setMatch(latest); hasSnapshot.current = true; setNotice('Goal removed and the score corrected.');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not correct that goal.'); }
    finally { setBusy(false); }
  };

  const removeQueuedGoal = async (clientEventId: string) => {
    const pending = queue.filter(goal => goal.clientEventId !== clientEventId);
    await AsyncStorage.setItem(queueKey, JSON.stringify(pending));
    setQueue(pending); setNotice('Unsynced goal removed from this phone.');
  };

  if (loading && !match) return <Screen><BrandHeader back subtitle="LIVE MATCH CONTROL" /><ActivityIndicator color={colors.primary} /></Screen>;
  if (error && !match) return <Screen><BrandHeader back subtitle="LIVE MATCH CONTROL" /><EmptyState icon="alert-circle" title="Could not open match controls." body={error} action="Try again" onAction={() => void syncLive()} /></Screen>;
  if (!match) return null;
  const redScore = match.score.red + pendingRed; const blueScore = match.score.blue + pendingBlue;
  const activePhase = match.liveStatus === 'first_half' || match.liveStatus === 'second_half';
  const canRecord = activePhase && Boolean(team && scorer) && !busy;

  return <Screen refreshing={false} onRefresh={() => { void syncLive(); }}>
    <BrandHeader back subtitle="LIVE MATCH CONTROL" />
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.primary }]}>REFEREE DESK</Text><Text style={[styles.title, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{match.neighborhood}{match.refereeName ? ` · ${match.refereeName}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh live match" onPress={() => void syncLive()} style={[styles.refresh, { borderColor: colors.border }]}><Feather name="refresh-cw" size={17} color={colors.primary} /></Pressable></View>

    <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.scoreHeader}><View style={[styles.livePill, { backgroundColor: activePhase ? 'rgba(255,83,100,.16)' : colors.secondary }]}><View style={[styles.liveDot, { backgroundColor: activePhase ? RED : colors.mutedForeground }]} /><Text style={{ color: activePhase ? RED : colors.mutedForeground, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{match.liveStatus.replace('_', ' ').toUpperCase()}</Text></View><Text style={[styles.clock, { color: colors.foreground }]}>{displayClock()}</Text></View>
      <View style={styles.scoreRow}><View style={[styles.teamBox, { backgroundColor: 'rgba(255,83,100,.12)', borderColor: 'rgba(255,83,100,.45)' }]}><View style={[styles.teamDot, { backgroundColor: RED }]} /><Text style={[styles.teamName, { color: RED }]}>RED</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{redScore}</Text>{pendingRed ? <Text style={[styles.syncHint, { color: RED }]}>+{pendingRed} waiting to sync</Text> : null}</View><Text style={[styles.scoreDash, { color: colors.mutedForeground }]}>—</Text><View style={[styles.teamBox, { backgroundColor: 'rgba(87,155,255,.12)', borderColor: 'rgba(87,155,255,.45)' }]}><View style={[styles.teamDot, { backgroundColor: BLUE }]} /><Text style={[styles.teamName, { color: BLUE }]}>BLUE</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{blueScore}</Text>{pendingBlue ? <Text style={[styles.syncHint, { color: BLUE }]}>+{pendingBlue} waiting to sync</Text> : null}</View></View>
      {phaseAction ? <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void changePhase()} style={[styles.phaseButton, { backgroundColor: colors.primary, opacity: busy ? .6 : 1 }]}><Feather name={phaseAction.icon as never} size={17} color={colors.primaryForeground} /><Text style={[styles.phaseButtonText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : phaseAction.label}</Text></Pressable> : <Text style={[styles.fullTimeNote, { color: colors.primary }]}>Final score saved · match complete</Text>}
    </View>

    {activePhase ? <View style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Record a goal</Text>
      <Text style={[styles.helper, { color: colors.mutedForeground }]}>Choose the scoring team, then the player. Assist is optional.</Text>
      <View style={styles.teamChoices}>{(['red', 'blue'] as Team[]).map(option => { const selected = team === option; const tint = option === 'red' ? RED : BLUE; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setTeam(option); setScorerId(''); setAssistId(''); }} style={[styles.teamChoice, { borderColor: selected ? tint : colors.border, backgroundColor: selected ? `${tint}20` : colors.background }]}><View style={[styles.teamDot, { backgroundColor: tint }]} /><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11, fontWeight: '900' }}>{option.toUpperCase()} TEAM</Text><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11 }}>{selected ? '✓' : ''}</Text></Pressable>; })}</View>
      {team ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SCORER</Text><View style={styles.playerChoices}>{roster.map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: scorerId === player.userId }} onPress={() => { setScorerId(player.userId); if (assistId === player.userId) setAssistId(''); }} style={[styles.playerChoice, { borderColor: scorerId === player.userId ? colors.primary : colors.border, backgroundColor: scorerId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: scorerId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View>
        {scorer ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>ASSIST · OPTIONAL</Text><View style={styles.playerChoices}><Pressable accessibilityRole="button" accessibilityState={{ selected: !assistId }} onPress={() => setAssistId('')} style={[styles.playerChoice, { borderColor: !assistId ? colors.primary : colors.border, backgroundColor: !assistId ? colors.accent : colors.background }]}><Text style={{ color: !assistId ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: '700' }}>No assist</Text></Pressable>{roster.filter(player => player.userId !== scorerId).map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: assistId === player.userId }} onPress={() => setAssistId(player.userId)} style={[styles.playerChoice, { borderColor: assistId === player.userId ? colors.primary : colors.border, backgroundColor: assistId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: assistId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View></> : null}
      </> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canRecord, busy }} disabled={!canRecord} onPress={() => void recordGoal()} style={[styles.goalButton, { backgroundColor: team === 'red' ? RED : team === 'blue' ? BLUE : colors.secondary, opacity: canRecord ? 1 : .48 }]}><Feather name="plus-circle" size={18} color={team ? '#07120D' : colors.mutedForeground} /><Text style={[styles.goalButtonText, { color: team ? '#07120D' : colors.mutedForeground }]}>{busy ? 'Saving goal…' : scorer ? `Record ${scorer.firstName}’s goal` : 'Select team and scorer'}</Text></Pressable>
    </View> : null}

    {queue.length ? <View accessibilityRole="status" style={[styles.connectionNotice, { backgroundColor: 'rgba(245,196,81,.12)', borderColor: 'rgba(245,196,81,.4)' }]}><Feather name="wifi-off" size={15} color="#F5C451" /><Text style={{ color: '#F5C451', fontSize: 10, fontWeight: '700', flex: 1 }}>{queue.length} goal{queue.length === 1 ? '' : 's'} saved on this phone, waiting for internet to sync.</Text></View> : null}
    {notice ? <Text accessibilityRole="status" style={[styles.notice, { color: queue.length ? '#F5C451' : colors.mutedForeground }]}>{notice}</Text> : null}

    <View style={styles.timelineHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Match timeline</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals sync to players every few seconds.</Text></View><View style={[styles.eventCount, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 9, fontWeight: '800' }}>{match.events.length + queue.length} EVENTS</Text></View></View>
    {match.events.length || queue.length ? [...match.events.map(event => ({ ...event, pending: false })), ...queue.map(goal => ({ id: goal.clientEventId, clientEventId: goal.clientEventId, type: 'goal' as const, team: goal.team, period: 0, minute: 0, scorerUserId: goal.scorerUserId, scorerName: match.players.find(player => player.userId === goal.scorerUserId)?.firstName || 'Player', assistUserId: goal.assistUserId, assistName: match.players.find(player => player.userId === goal.assistUserId)?.firstName || null, createdAt: goal.occurredAt, pending: true }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(event => {
      const tint = event.team === 'red' ? RED : BLUE;
      return <View key={event.clientEventId} style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.eventIcon, { backgroundColor: `${tint}22` }]}><Feather name="award" size={16} color={tint} /></View><View style={{ flex: 1 }}><Text style={[styles.eventText, { color: colors.foreground }]}>{event.scorerName} scored <Text style={{ color: tint }}>for {event.team.toUpperCase()}</Text></Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.pending ? 'Saved on this phone · waiting to sync' : `${event.period === 1 ? '1ST HALF' : '2ND HALF'} · ${event.minute}′`}{event.assistName ? ` · Assist: ${event.assistName}` : ''}</Text></View>{event.pending ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove unsynced goal by ${event.scorerName}`} onPress={() => void removeQueuedGoal(event.clientEventId)} style={styles.undo}><Feather name="x" size={16} color="#F5C451" /></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${event.scorerName}'s goal`} disabled={busy} onPress={() => void undoGoal(event as Goal)} style={styles.undo}><Feather name="rotate-ccw" size={15} color={colors.mutedForeground} /></Pressable>}</View>;
    }) : <View style={[styles.emptyTimeline, { borderColor: colors.border }]}><Feather name="activity" size={18} color={colors.mutedForeground} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals and assists will appear here.</Text></View>}
  </Screen>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 7 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, title: { fontFamily: 'Georgia', fontSize: 26, marginTop: 5 }, subtitle: { fontSize: 10, marginTop: 4 }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scoreCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 18 }, scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, livePill: { minHeight: 29, borderRadius: 20, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, clock: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 15 }, teamBox: { flex: 1, minHeight: 123, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 9 }, teamDot: { width: 9, height: 9, borderRadius: 5 }, teamName: { fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginTop: 5 }, scoreNumber: { fontSize: 46, lineHeight: 53, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreDash: { fontSize: 19, fontWeight: '700' }, syncHint: { fontSize: 8, fontWeight: '700' }, phaseButton: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14 }, phaseButtonText: { fontSize: 12, fontWeight: '900' }, fullTimeNote: { textAlign: 'center', fontSize: 11, fontWeight: '800', marginTop: 17 },
  goalCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 }, sectionTitle: { fontSize: 15, fontWeight: '900' }, helper: { fontSize: 10, lineHeight: 15, marginTop: 4 }, teamChoices: { flexDirection: 'row', gap: 9, marginTop: 12 }, teamChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, playerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }, fieldLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 13 }, playerChoice: { minHeight: 42, maxWidth: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, justifyContent: 'center' }, goalButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }, goalButtonText: { fontSize: 11, fontWeight: '900' },
  connectionNotice: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, notice: { fontSize: 10, lineHeight: 15, marginTop: 9 }, timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }, eventCount: { minHeight: 26, borderRadius: 20, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }, eventRow: { minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }, eventIcon: { height: 34, width: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, eventText: { fontSize: 11, fontWeight: '800' }, eventMeta: { fontSize: 9, marginTop: 4 }, undo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, emptyTimeline: { minHeight: 70, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
