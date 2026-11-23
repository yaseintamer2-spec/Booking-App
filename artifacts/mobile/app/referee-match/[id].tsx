import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { loadSampleParticipants, matchRegistrationMock } from '@/data/matchRegistrationMock';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

type Team = 'red' | 'blue';
type Player = { userId: string; firstName: string; avatarUrl: string | null; pitchSlot: number | null; age?: number | null; liveTeam?: Team | null; team: Team };
type EventType = 'goal' | 'yellow_card' | 'red_card';
type MatchEvent = { id: string; clientEventId: string; type: EventType; team: Team; period: number; minute: number; scorerUserId: string; scorerName: string; assistUserId: string | null; assistName: string | null; suspensionMinutes?: number | null; occurredAt?: string; createdAt: string };
type PendingEvent = { clientEventId: string; type: EventType; team: Team; scorerUserId: string; assistUserId: string | null; occurredAt: string; suspensionMinutes?: number | null };
type LiveSnapshot = { id: string; venueName: string; neighborhood: string; durationMinutes: number; refereeUserId: string | null; refereeName: string | null; liveStatus: 'scheduled' | 'first_half' | 'halftime' | 'second_half' | 'full_time'; liveStartedAt: string | null; livePhaseStartedAt: string | null; liveFirstHalfEndedAt: string | null; liveSecondHalfStartedAt: string | null; liveEndedAt: string | null; teamsGeneratedAt: string | null; registeredCount: number; checkedInCount: number; score: { red: number; blue: number }; players: Player[]; events: MatchEvent[] };
const RED = '#FF5364';
const BLUE = '#579BFF';
const LOCAL_LIVE_MATCH_KEY = 'kickoff.local-preview.live-match.v2';

function balanceLocalPlayers(players: Array<Player & { age?: number | null }>): Map<string, Team> {
  const groups = new Map<string, typeof players>();
  players.forEach(player => {
    const ageKey = player.age == null ? 'unknown' : String(player.age);
    groups.set(ageKey, [...(groups.get(ageKey) ?? []), player]);
  });
  let redCount = 0;
  let blueCount = 0;
  const assignments = new Map<string, Team>();
  [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([, group]) => {
    const shuffled = [...group].sort(() => Math.random() - .5);
    let redForAge = Math.floor(shuffled.length / 2);
    let blueForAge = Math.floor(shuffled.length / 2);
    if (shuffled.length % 2) {
      if (redCount < blueCount || (redCount === blueCount && Math.random() < .5)) redForAge++;
      else blueForAge++;
    }
    shuffled.forEach((player, index) => {
      const assigned: Team = index < redForAge ? 'red' : 'blue';
      assignments.set(player.userId, assigned);
    });
    redCount += redForAge;
    blueCount += blueForAge;
  });
  return assignments;
}

function createLocalLiveSnapshot(matchId: string, players: Awaited<ReturnType<typeof loadSampleParticipants>>): LiveSnapshot {
  const now = new Date().toISOString();
  return {
    id: matchId,
    venueName: matchRegistrationMock.match.pitchName,
    neighborhood: matchRegistrationMock.match.area,
    durationMinutes: matchRegistrationMock.match.durationHours * 60,
    refereeUserId: 'local-owner',
    refereeName: 'Owner preview',
    liveStatus: 'scheduled',
    liveStartedAt: null,
    livePhaseStartedAt: null,
    liveFirstHalfEndedAt: null,
    liveSecondHalfStartedAt: null,
    liveEndedAt: null,
    teamsGeneratedAt: null,
    registeredCount: players.length,
    checkedInCount: 0,
    score: { red: 0, blue: 0 },
    players: [],
    events: [],
  };
}

export default function RefereeMatchScreen() {
  const colors = useColors(); const { getToken } = useAuth(); const router = useRouter();
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const matchId = Array.isArray(routeId) ? routeId[0] : routeId;
  const localPreview = isLocalPreviewMode && matchId === matchRegistrationMock.match.id;
  const queueKey = `kickoff:match-live-events:${matchId}`;
  const [match, setMatch] = useState<LiveSnapshot | null>(null);
  const [queue, setQueue] = useState<PendingEvent[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [scorerId, setScorerId] = useState('');
  const [assistId, setAssistId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cardConfirmation, setCardConfirmation] = useState<{ player: Player; type: 'yellow_card' | 'red_card' } | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [teamActionBusy, setTeamActionBusy] = useState(false);
  const [minuteReminder, setMinuteReminder] = useState('');
  const syncing = useRef(false);
  const hasSnapshot = useRef(false);
  const reminderShown = useRef(false);
  const reminderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => () => { if (reminderTimer.current) clearTimeout(reminderTimer.current); }, []);
  useEffect(() => { reminderShown.current = false; setMinuteReminder(''); }, [matchId]);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetchWithTimeout(`${apiBaseUrl}/api${path}`, { ...init, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } }, 12_000);
    const result = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(result?.error || 'Could not update the live match.');
    return result;
  }, [getToken]);

  const syncLive = useCallback(async () => {
    if (!matchId || syncing.current) return;
    syncing.current = true;
    try {
      if (localPreview) {
        const stored = await AsyncStorage.getItem(LOCAL_LIVE_MATCH_KEY);
        const snapshot = stored ? JSON.parse(stored) as LiveSnapshot : createLocalLiveSnapshot(matchId, await loadSampleParticipants());
        if (!stored) await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(snapshot));
        setMatch(snapshot);
        setQueue([]);
        hasSnapshot.current = true;
        setError('');
        return;
      }
      const storedQueue = (JSON.parse(await AsyncStorage.getItem(queueKey) || '[]') as PendingEvent[]).map(event => ({ ...event, type: event.type ?? 'goal' }));
      setQueue(storedQueue);
      const snapshot = await request(`/matches/${matchId}/live`) as LiveSnapshot;
      setMatch(snapshot); hasSnapshot.current = true; setError('');
      let pending = (JSON.parse(await AsyncStorage.getItem(queueKey) || '[]') as PendingEvent[]).map(event => ({ ...event, type: event.type ?? 'goal' }));
      const serverIds = new Set(snapshot.events.map(event => event.clientEventId));
      pending = pending.filter(goal => !serverIds.has(goal.clientEventId));
      await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending);
      for (const goal of pending) {
        try {
          const latest = await request(`/matches/${matchId}/live/events`, { method: 'POST', body: JSON.stringify(goal) }) as LiveSnapshot;
          pending = pending.filter(item => item.clientEventId !== goal.clientEventId);
          await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending); setMatch(latest);
          setNotice(goal.type === 'goal' ? 'Queued goal synced. Players can see the updated score.' : 'Queued card synced to the match timeline.');
        } catch {
          setNotice('Connection paused. Event saved on this phone and will sync when you reconnect.');
          break;
        }
      }
    } catch (cause) {
      if (!hasSnapshot.current) setError(cause instanceof Error ? cause.message : 'Could not load this match.');
      else setNotice('Trying to reconnect. New changes will sync when the connection returns.');
    } finally { setLoading(false); syncing.current = false; }
  }, [matchId, queueKey, request, localPreview]);

  useFocusEffect(useCallback(() => {
    void syncLive();
    if (localPreview) return;
    const timer = setInterval(() => { void syncLive(); }, 3000);
    return () => clearInterval(timer);
  }, [syncLive, localPreview]));

  const roster = useMemo(() => match?.players.filter(player => player.team === team) ?? [], [match?.players, team]);
  const scorer = roster.find(player => player.userId === scorerId);
  const assistant = roster.find(player => player.userId === assistId);
  const phaseAction = match?.liveStatus === 'scheduled' ? { action: 'start_first_half', label: 'Start first half', icon: 'play' }
    : match?.liveStatus === 'first_half' ? { action: 'start_halftime', label: 'Start half-time break', icon: 'pause' }
      : match?.liveStatus === 'halftime' ? { action: 'start_second_half', label: 'Start second half', icon: 'play' }
        : match?.liveStatus === 'second_half' ? { action: 'finish_match', label: 'Finish match · full time', icon: 'flag' } : null;
  const visibleServerIds = new Set(match?.events.map(event => event.clientEventId) ?? []);
  const pendingRed = queue.filter(goal => goal.type === 'goal' && goal.team === 'red' && !visibleServerIds.has(goal.clientEventId)).length;
  const pendingBlue = queue.filter(goal => goal.type === 'goal' && goal.team === 'blue' && !visibleServerIds.has(goal.clientEventId)).length;
  const displayClock = () => {
    if (!match?.livePhaseStartedAt || (match.liveStatus !== 'first_half' && match.liveStatus !== 'second_half')) return match?.liveStatus === 'halftime' ? `${Math.ceil(match.durationMinutes / 2)}′` : '00′';
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(match.livePhaseStartedAt).getTime()) / 60_000));
    return `${(match.liveStatus === 'second_half' ? Math.ceil(match.durationMinutes / 2) : 0) + elapsed}′`;
  };

  const canStartFirstHalf = Boolean(match?.teamsGeneratedAt && match.checkedInCount >= 2 && match.players.every(player => player.liveTeam === player.team));
  const getTimeoutEnd = (playerId: string): number | null => {
    const events = [...(match?.events ?? []), ...queue.filter(event => event.scorerUserId === playerId).map(event => ({ ...event, id: event.clientEventId, clientEventId: event.clientEventId, period: 0, minute: 0, scorerName: match?.players.find(player => player.userId === playerId)?.firstName || 'Player', assistName: null, createdAt: event.occurredAt }))].filter(event => event.scorerUserId === playerId && (event.type === 'yellow_card' || event.type === 'red_card')).sort((a, b) => (a.occurredAt || a.createdAt).localeCompare(b.occurredAt || b.createdAt));
    let yellows = 0; let dismissals = 0; let latestEnd: number | null = null;
    for (const event of events) {
      let isDismissal = event.type === 'red_card';
      if (event.type === 'yellow_card') { yellows += 1; isDismissal = event.suspensionMinutes != null || yellows % 2 === 0; }
      if (!isDismissal) continue;
      dismissals += 1;
      const duration = event.suspensionMinutes ?? (dismissals === 1 ? 15 : 30);
      latestEnd = new Date(event.occurredAt || event.createdAt).getTime() + duration * 60_000;
      yellows = 0;
    }
    return latestEnd;
  };
  const timeoutRemainingMs = (playerId: string) => Math.max(0, (getTimeoutEnd(playerId) ?? 0) - nowMs);
  const timeoutLabel = (playerId: string) => {
    const seconds = Math.ceil(timeoutRemainingMs(playerId) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!match || match.liveStatus !== 'first_half' || !match.livePhaseStartedAt || reminderShown.current) return;
    if (nowMs - new Date(match.livePhaseStartedAt).getTime() < 45 * 60_000) return;
    reminderShown.current = true;
    void (async () => {
      try {
        const key = `kickoff:referee-45-minute-reminder:${match.id}`;
        if (await AsyncStorage.getItem(key)) return;
        await AsyncStorage.setItem(key, 'shown');
        setMinuteReminder('45 minutes played · check the time and prepare for half-time.');
        reminderTimer.current = setTimeout(() => setMinuteReminder(''), 4500);
      } catch { /* The reminder still works as a transient if device storage is unavailable. */ }
    })();
  }, [match?.id, match?.liveStatus, match?.livePhaseStartedAt, nowMs]);

  const generateBalancedTeams = async () => {
    if (!match || teamActionBusy || match.liveStatus !== 'scheduled' || match.teamsGeneratedAt) return;
    setTeamActionBusy(true); setNotice('');
    try {
      if (localPreview) {
        const ageById = new Map((await loadSampleParticipants()).map(player => [player.userId, player.age ?? null]));
        const players = match.players.map(player => ({ ...player, age: player.age ?? ageById.get(player.userId) ?? null }));
        const assignedTeams = balanceLocalPlayers(players);
        const generatedAt = new Date().toISOString();
        const latest = { ...match, teamsGeneratedAt: generatedAt, players: players.map(player => { const team = assignedTeams.get(player.userId) ?? 'red'; return { ...player, liveTeam: team, team }; }) };
        await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(latest)); setMatch(latest);
      } else {
        const latest = await request(`/matches/${match.id}/live/teams/generate`, { method: 'POST' }) as LiveSnapshot;
        setMatch(latest); hasSnapshot.current = true;
      }
      setNotice('Teams generated. This one-time team draw is now locked.');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not generate balanced teams.'); }
    finally { setTeamActionBusy(false); }
  };

  const movePlayer = async (player: Player) => {
    if (!match || teamActionBusy || match.liveStatus === 'full_time' || !match.teamsGeneratedAt) return;
    const nextTeam: Team = player.team === 'red' ? 'blue' : 'red';
    const previousMatch = match;
    const optimisticMatch = { ...match, players: match.players.map(item => item.userId === player.userId ? { ...item, team: nextTeam, liveTeam: nextTeam } : item) };
    setMatch(optimisticMatch);
    setTeamActionBusy(true); setNotice('');
    try {
      if (localPreview) {
        await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(optimisticMatch));
      } else {
        const latest = await request(`/matches/${match.id}/live/teams/${encodeURIComponent(player.userId)}`, { method: 'PATCH', body: JSON.stringify({ team: nextTeam }) }) as LiveSnapshot;
        setMatch(latest); hasSnapshot.current = true;
      }
      if (scorerId === player.userId) { setScorerId(''); setAssistId(''); }
      setNotice(`${player.firstName} moved to the ${nextTeam.toUpperCase()} team. Previously recorded goals stay with the team they were scored for.`);
    } catch (cause) { setMatch(previousMatch); setNotice(cause instanceof Error ? cause.message : 'Could not move that player.'); }
    finally { setTeamActionBusy(false); }
  };

  const changePhase = async () => {
    if (!match || !phaseAction || busy) return;
    if (phaseAction.action === 'start_first_half' && !canStartFirstHalf) { setNotice('Scan player QR codes, then generate teams once before starting.'); return; }
    setBusy(true); setNotice('');
    try {
      if (localPreview) {
        const now = new Date().toISOString();
        const nextStatus = phaseAction.action === 'start_first_half' ? 'first_half'
          : phaseAction.action === 'start_halftime' ? 'halftime'
            : phaseAction.action === 'start_second_half' ? 'second_half' : 'full_time';
        const latest: LiveSnapshot = {
          ...match,
          liveStatus: nextStatus,
          liveStartedAt: match.liveStartedAt || now,
          livePhaseStartedAt: nextStatus === 'first_half' || nextStatus === 'second_half' ? now : match.livePhaseStartedAt,
          liveFirstHalfEndedAt: nextStatus === 'halftime' ? now : match.liveFirstHalfEndedAt,
          liveSecondHalfStartedAt: nextStatus === 'second_half' ? now : match.liveSecondHalfStartedAt,
          liveEndedAt: nextStatus === 'full_time' ? now : match.liveEndedAt,
        };
        await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(latest));
        setMatch(latest);
        hasSnapshot.current = true;
        setNotice(phaseAction.action === 'finish_match' ? 'Full time. Final score saved on this device.' : `${phaseAction.label} recorded on this device.`);
        return;
      }
      const latest = await request(`/matches/${match.id}/live/state`, { method: 'POST', body: JSON.stringify({ action: phaseAction.action }) }) as LiveSnapshot;
      setMatch(latest); hasSnapshot.current = true; setNotice(phaseAction.action === 'finish_match' ? 'Full time. Final score saved.' : `${phaseAction.label} recorded.`);
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not update the match phase. Check your connection.'); }
    finally { setBusy(false); }
  };

  const recordEvent = async (type: EventType, player = scorer) => {
    const eventTeam = player?.team ?? team;
    if (!match || !eventTeam || !player || busy || !['first_half', 'second_half'].includes(match.liveStatus)) return;
    setBusy(true); setNotice('');
    const event: PendingEvent = { clientEventId: Crypto.randomUUID(), type, team: eventTeam, scorerUserId: player.userId, assistUserId: type === 'goal' ? assistant?.userId ?? null : null, occurredAt: new Date().toISOString() };
    const priorCards = [...match.events, ...queue].filter(item => item.scorerUserId === player.userId && (item.type === 'yellow_card' || item.type === 'red_card')).sort((a, b) => (a.occurredAt || '').localeCompare(b.occurredAt || ''));
    let previousYellows = 0; let previousDismissals = 0;
    for (const card of priorCards) { if (card.type === 'red_card' || card.suspensionMinutes != null) { previousDismissals += 1; previousYellows = 0; } else if (card.type === 'yellow_card') previousYellows += 1; }
    const suspensionMinutes = type === 'red_card' || (type === 'yellow_card' && previousYellows >= 1) ? (previousDismissals ? 30 : 15) : null;
    const pendingEvent = { ...event, suspensionMinutes };
    const pending = [...queue, pendingEvent];
    try {
      if (localPreview) {
        const scorerPlayer = match.players.find(item => item.userId === event.scorerUserId)!;
        const assistPlayer = event.assistUserId ? match.players.find(item => item.userId === event.assistUserId) : null;
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(match.livePhaseStartedAt || event.occurredAt).getTime()) / 60_000));
        const period = match.liveStatus === 'second_half' ? 2 : 1;
        const eventRow: MatchEvent = {
          id: event.clientEventId,
          clientEventId: event.clientEventId,
          type: event.type,
          team: event.team,
          period,
          minute: (period === 2 ? Math.ceil(match.durationMinutes / 2) : 0) + elapsed,
          scorerUserId: event.scorerUserId,
          scorerName: scorerPlayer.firstName,
          assistUserId: event.assistUserId,
          assistName: assistPlayer?.firstName ?? null,
          suspensionMinutes,
          occurredAt: event.occurredAt,
          createdAt: event.occurredAt,
        };
        const latest: LiveSnapshot = {
          ...match,
          score: event.type === 'goal' ? { ...match.score, [event.team]: match.score[event.team] + 1 } : match.score,
          events: [...match.events, eventRow],
        };
        await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(latest));
        setMatch(latest); setQueue([]); setNotice(event.type === 'goal' ? 'Goal added. The preview score is updated.' : `${event.type === 'yellow_card' ? 'Yellow' : 'Red'} card recorded in the preview.`);
        setScorerId(''); setAssistId(''); setCardConfirmation(null);
        return;
      }
      await AsyncStorage.setItem(queueKey, JSON.stringify(pending)); setQueue(pending);
    } catch {
      setNotice('Could not save this event on the phone. Please try again.'); setBusy(false); return;
    }
    try {
      setNotice(type === 'goal' ? 'Goal saved on this phone. Syncing live score…' : 'Card saved on this phone. Syncing to the match…');
      const latest = await request(`/matches/${match.id}/live/events`, { method: 'POST', body: JSON.stringify(pendingEvent) }) as LiveSnapshot;
      const remaining = pending.filter(item => item.clientEventId !== event.clientEventId);
      await AsyncStorage.setItem(queueKey, JSON.stringify(remaining)); setQueue(remaining); setMatch(latest); hasSnapshot.current = true;
      setNotice(type === 'goal' ? 'Goal added. The live score is updated.' : `${type === 'yellow_card' ? 'Yellow' : 'Red'} card confirmed and recorded.`); setScorerId(''); setAssistId(''); setCardConfirmation(null);
    } catch {
      setNotice('Connection paused. Event saved on this phone and will sync when you reconnect.'); setCardConfirmation(null);
    } finally { setBusy(false); }
  };

  const recordGoal = () => recordEvent('goal');

  const undoGoal = async (event: MatchEvent) => {
    if (!match || busy) return;
    setBusy(true); setNotice('');
    try {
      if (localPreview) {
        const events = match.events.filter(item => item.id !== event.id);
        const score = events.filter(item => item.type === 'goal').reduce((current, item) => ({ ...current, [item.team]: current[item.team] + 1 }), { red: 0, blue: 0 });
        const latest = { ...match, events, score };
        await AsyncStorage.setItem(LOCAL_LIVE_MATCH_KEY, JSON.stringify(latest));
        setMatch(latest);
        setNotice(event.type === 'goal' ? 'Goal removed and the preview score corrected.' : 'Card removed from the preview timeline.');
        return;
      }
      const latest = await request(`/matches/${match.id}/live/events/${event.id}`, { method: 'DELETE' }) as LiveSnapshot;
      setMatch(latest); hasSnapshot.current = true; setNotice(event.type === 'goal' ? 'Goal removed and the score corrected.' : 'Card removed from the timeline.');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Could not correct that goal.'); }
    finally { setBusy(false); }
  };

  const removeQueuedGoal = async (clientEventId: string) => {
    const pending = queue.filter(goal => goal.clientEventId !== clientEventId);
    await AsyncStorage.setItem(queueKey, JSON.stringify(pending));
    setQueue(pending); setNotice('Unsynced goal removed from this phone.');
  };

  if (loading && !match) return <Screen><BrandHeader back backFallback="/referee-matches" subtitle="LIVE MATCH CONTROL" /><ActivityIndicator color={colors.primary} /></Screen>;
  if (error && !match) return <Screen><BrandHeader back backFallback="/referee-matches" subtitle="LIVE MATCH CONTROL" /><EmptyState icon="alert-circle" title="Could not open match controls." body={error} action="Try again" onAction={() => void syncLive()} /></Screen>;
  if (!match) return null;
  const redScore = match.score.red + pendingRed; const blueScore = match.score.blue + pendingBlue;
  const activePhase = match.liveStatus === 'first_half' || match.liveStatus === 'second_half';
  const canRecord = activePhase && Boolean(team && scorer) && !busy && (!scorer || timeoutRemainingMs(scorer.userId) === 0);
  const cardsByPlayer = (playerId: string) => match.events.filter(event => event.scorerUserId === playerId && (event.type === 'yellow_card' || event.type === 'red_card'));
  const timelineEvents: Array<MatchEvent & { pending: boolean }> = [
    ...match.events.map(event => ({ ...event, pending: false })),
    ...queue.map(goal => ({ ...goal, id: goal.clientEventId, clientEventId: goal.clientEventId, period: 0, minute: 0, scorerName: match.players.find(player => player.userId === goal.scorerUserId)?.firstName || 'Player', assistName: null, occurredAt: goal.occurredAt, createdAt: goal.occurredAt, suspensionMinutes: goal.suspensionMinutes ?? null, pending: true })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return <Screen refreshing={false} onRefresh={() => { void syncLive(); }}>
    <BrandHeader back backFallback="/referee-matches" subtitle="LIVE MATCH CONTROL" />
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.primary }]}>REFEREE DESK</Text><Text style={[styles.title, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{match.neighborhood}{match.refereeName ? ` · ${match.refereeName}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh live match" onPress={() => void syncLive()} style={[styles.refresh, { borderColor: colors.border }]}><Feather name="refresh-cw" size={17} color={colors.primary} /></Pressable></View>

    {minuteReminder ? <View accessibilityRole="status" style={styles.minuteReminder}><Feather name="clock" size={16} color="#120A33" /><Text style={styles.minuteReminderText}>{minuteReminder}</Text></View> : null}

    <View style={[styles.admissionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.admissionIcon, { backgroundColor: `${colors.primary}22` }]}><Feather name="user-check" size={19} color={colors.primary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.teamBalanceTitle, { color: colors.foreground }]}>Admit players</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>{match.checkedInCount} admitted · {match.registeredCount} registered. Only players with a scanned, age-checked QR appear in the match.</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={match.teamsGeneratedAt || match.liveStatus !== 'scheduled' ? 'Player admission is closed' : 'Scan a player QR code to admit them'} accessibilityState={{ disabled: Boolean(match.teamsGeneratedAt || match.liveStatus !== 'scheduled') }} disabled={Boolean(match.teamsGeneratedAt || match.liveStatus !== 'scheduled')} onPress={() => router.push({ pathname: '/staff-check-in', params: { matchId: match.id, returnMatchId: match.id } })} style={[styles.admitButton, { backgroundColor: colors.primary, opacity: match.teamsGeneratedAt || match.liveStatus !== 'scheduled' ? .48 : 1 }]}><Feather name="camera" size={15} color={colors.primaryForeground} /><Text style={[styles.balanceButtonText, { color: colors.primaryForeground }]}>{match.teamsGeneratedAt ? 'Locked' : match.liveStatus !== 'scheduled' ? 'Closed' : 'Scan QR'}</Text></Pressable>
    </View>

    <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.scoreHeader}><View style={[styles.livePill, { backgroundColor: activePhase ? 'rgba(255,83,100,.16)' : colors.secondary }]}><View style={[styles.liveDot, { backgroundColor: activePhase ? RED : colors.mutedForeground }]} /><Text style={{ color: activePhase ? RED : colors.mutedForeground, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{match.liveStatus.replace('_', ' ').toUpperCase()}</Text></View><Text style={[styles.clock, { color: colors.foreground }]}>{displayClock()}</Text></View>
      <View style={styles.scoreRow}><View style={[styles.teamBox, { backgroundColor: 'rgba(255,83,100,.12)', borderColor: 'rgba(255,83,100,.45)' }]}><View style={[styles.teamDot, { backgroundColor: RED }]} /><Text style={[styles.teamName, { color: RED }]}>RED</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{redScore}</Text>{pendingRed ? <Text style={[styles.syncHint, { color: RED }]}>+{pendingRed} waiting to sync</Text> : null}</View><Text style={[styles.scoreDash, { color: colors.mutedForeground }]}>—</Text><View style={[styles.teamBox, { backgroundColor: 'rgba(87,155,255,.12)', borderColor: 'rgba(87,155,255,.45)' }]}><View style={[styles.teamDot, { backgroundColor: BLUE }]} /><Text style={[styles.teamName, { color: BLUE }]}>BLUE</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{blueScore}</Text>{pendingBlue ? <Text style={[styles.syncHint, { color: BLUE }]}>+{pendingBlue} waiting to sync</Text> : null}</View></View>
      {phaseAction ? <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy || (phaseAction.action === 'start_first_half' && !canStartFirstHalf) }} disabled={busy || (phaseAction.action === 'start_first_half' && !canStartFirstHalf)} onPress={() => void changePhase()} style={[styles.phaseButton, { backgroundColor: colors.primary, opacity: busy || (phaseAction.action === 'start_first_half' && !canStartFirstHalf) ? .55 : 1 }]}><Feather name={phaseAction.icon as never} size={17} color={colors.primaryForeground} /><Text style={[styles.phaseButtonText, { color: colors.primaryForeground }]}>{busy ? 'Working…' : phaseAction.action === 'start_first_half' && !canStartFirstHalf ? 'Admit players & generate teams' : phaseAction.label}</Text></Pressable> : <Text style={[styles.fullTimeNote, { color: colors.primary }]}>Final score saved · match complete</Text>}
    </View>

    <View style={styles.rostersHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Team rosters</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>Tap a player to select them. Confirm cards as they happen.</Text></View><View style={[styles.eventCount, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 9, fontWeight: '800' }}>{match.players.length} PLAYERS</Text></View></View>
    <View style={[styles.teamBalanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}><Text style={[styles.teamBalanceTitle, { color: colors.foreground }]}>{match.teamsGeneratedAt ? 'Teams set · one-time draw' : 'Generate balanced teams'}</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>{match.teamsGeneratedAt ? 'Team generation is complete. Tap MOVE beside a player to reassign them quickly.' : 'Admit the players who arrived first. Then generate once; each age is split fairly and admission locks.'}</Text></View>
      {match.liveStatus === 'scheduled' && !match.teamsGeneratedAt ? <Pressable accessibilityRole="button" accessibilityLabel="Generate balanced teams once" accessibilityState={{ busy: teamActionBusy, disabled: teamActionBusy || match.checkedInCount < 2 }} disabled={teamActionBusy || match.checkedInCount < 2} onPress={() => void generateBalancedTeams()} style={[styles.balanceButton, { backgroundColor: colors.primary, opacity: teamActionBusy || match.checkedInCount < 2 ? .55 : 1 }]}><Feather name="shuffle" size={15} color={colors.primaryForeground} /><Text style={[styles.balanceButtonText, { color: colors.primaryForeground }]}>{teamActionBusy ? 'Working…' : 'Generate once'}</Text></Pressable> : null}
    </View>
    <View style={styles.rosterColumns}>{(['red', 'blue'] as Team[]).map(rosterTeam => {
      const tint = rosterTeam === 'red' ? RED : BLUE;
      const players = match.players.filter(player => player.team === rosterTeam);
      return <View key={rosterTeam} style={[styles.rosterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rosterTeamHeader}><View style={[styles.teamDot, { backgroundColor: tint }]} /><Text style={[styles.rosterTeamName, { color: tint }]}>{rosterTeam.toUpperCase()}</Text><Text style={[styles.rosterCount, { color: colors.mutedForeground }]}>{players.length}</Text></View>
        {players.map(player => {
          const playerCards = cardsByPlayer(player.userId);
          const timeoutMs = timeoutRemainingMs(player.userId);
          const redCarded = timeoutMs > 0;
          return <View key={player.userId} style={[styles.rosterPlayer, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={redCarded ? `${player.firstName} is serving a red card timeout` : `Select ${player.firstName} from ${rosterTeam} team`} accessibilityState={{ selected: scorerId === player.userId, disabled: redCarded }} disabled={redCarded} onPress={() => { setTeam(rosterTeam); setScorerId(player.userId); setAssistId(''); }} style={styles.playerIdentity}>
              {player.avatarUrl ? <Image source={{ uri: player.avatarUrl }} accessibilityLabel={`${player.firstName}'s profile picture`} style={styles.avatar} /> : <View style={[styles.avatar, styles.initialsAvatar, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '900' }}>{player.firstName.slice(0, 1).toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: redCarded ? colors.mutedForeground : colors.foreground, fontSize: 10, fontWeight: '800' }}>{player.firstName}</Text>{redCarded ? <Text style={styles.timeoutText}>OUT · {timeoutLabel(player.userId)}</Text> : playerCards.length ? <View style={styles.cardBadges}>{playerCards.map(card => <View key={card.id} style={[styles.cardBadge, { backgroundColor: card.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} />)}{playerCards.some(card => card.suspensionMinutes != null) ? <View style={[styles.cardBadge, { backgroundColor: '#EF4444' }]} /> : null}</View> : null}</View>
            </Pressable>
            {activePhase && !redCarded ? <View style={styles.cardActions}><Pressable accessibilityRole="button" accessibilityLabel={`Confirm yellow card for ${player.firstName}`} onPress={() => setCardConfirmation({ player, type: 'yellow_card' })} style={[styles.cardAction, { backgroundColor: '#F4C542' }]}><Text style={styles.cardActionText}>Y</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm red card for ${player.firstName}`} onPress={() => setCardConfirmation({ player, type: 'red_card' })} style={[styles.cardAction, { backgroundColor: '#EF4444' }]}><Text style={styles.cardActionText}>R</Text></Pressable></View> : null}
            {match.teamsGeneratedAt && match.liveStatus !== 'full_time' ? <Pressable accessibilityRole="button" accessibilityLabel={`Move ${player.firstName} to the ${rosterTeam === 'red' ? 'blue' : 'red'} team`} disabled={teamActionBusy} onPress={() => void movePlayer(player)} style={[styles.movePlayerButton, { borderColor: tint, backgroundColor: `${tint}18`, opacity: teamActionBusy ? .45 : 1 }]}><Feather name="repeat" size={13} color={tint} /><Text style={[styles.movePlayerText, { color: tint }]}>{teamActionBusy ? 'WAIT' : 'MOVE'}</Text></Pressable> : null}
          </View>;
        })}
        {!players.length ? <Text style={[styles.emptyRoster, { color: colors.mutedForeground }]}>No players assigned</Text> : null}
      </View>;
    })}</View>

    {activePhase ? <View style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Record a goal</Text>
      <Text style={[styles.helper, { color: colors.mutedForeground }]}>Choose the scoring team, then the player. Assist is optional.</Text>
      <View style={styles.teamChoices}>{(['red', 'blue'] as Team[]).map(option => { const selected = team === option; const tint = option === 'red' ? RED : BLUE; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setTeam(option); setScorerId(''); setAssistId(''); }} style={[styles.teamChoice, { borderColor: selected ? tint : colors.border, backgroundColor: selected ? `${tint}20` : colors.background }]}><View style={[styles.teamDot, { backgroundColor: tint }]} /><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11, fontWeight: '900' }}>{option.toUpperCase()} TEAM</Text><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11 }}>{selected ? '✓' : ''}</Text></Pressable>; })}</View>
      {team ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SCORER</Text><View style={styles.playerChoices}>{roster.filter(player => timeoutRemainingMs(player.userId) === 0).map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: scorerId === player.userId }} onPress={() => { setScorerId(player.userId); if (assistId === player.userId) setAssistId(''); }} style={[styles.playerChoice, { borderColor: scorerId === player.userId ? colors.primary : colors.border, backgroundColor: scorerId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: scorerId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View>
        {scorer ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>ASSIST · OPTIONAL</Text><View style={styles.playerChoices}><Pressable accessibilityRole="button" accessibilityState={{ selected: !assistId }} onPress={() => setAssistId('')} style={[styles.playerChoice, { borderColor: !assistId ? colors.primary : colors.border, backgroundColor: !assistId ? colors.accent : colors.background }]}><Text style={{ color: !assistId ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: '700' }}>No assist</Text></Pressable>{roster.filter(player => player.userId !== scorerId && timeoutRemainingMs(player.userId) === 0).map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: assistId === player.userId }} onPress={() => setAssistId(player.userId)} style={[styles.playerChoice, { borderColor: assistId === player.userId ? colors.primary : colors.border, backgroundColor: assistId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: assistId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View></> : null}
      </> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canRecord, busy }} disabled={!canRecord} onPress={() => void recordGoal()} style={[styles.goalButton, { backgroundColor: team === 'red' ? RED : team === 'blue' ? BLUE : colors.secondary, opacity: canRecord ? 1 : .48 }]}><Feather name="plus-circle" size={18} color={team ? '#07120D' : colors.mutedForeground} /><Text style={[styles.goalButtonText, { color: team ? '#07120D' : colors.mutedForeground }]}>{busy ? 'Saving goal…' : scorer ? `Record ${scorer.firstName}’s goal` : 'Select team and scorer'}</Text></Pressable>
    </View> : null}

    {queue.length ? <View accessibilityRole="status" style={[styles.connectionNotice, { backgroundColor: 'rgba(245,196,81,.12)', borderColor: 'rgba(245,196,81,.4)' }]}><Feather name="wifi-off" size={15} color="#F5C451" /><Text style={{ color: '#F5C451', fontSize: 10, fontWeight: '700', flex: 1 }}>{queue.length} event{queue.length === 1 ? '' : 's'} saved on this phone, waiting for internet to sync.</Text></View> : null}
    {notice ? <Text accessibilityRole="status" style={[styles.notice, { color: queue.length ? '#F5C451' : colors.mutedForeground }]}>{notice}</Text> : null}

    <View style={styles.timelineHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Match timeline</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals and cards sync to players every few seconds.</Text></View><View style={[styles.eventCount, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 9, fontWeight: '800' }}>{match.events.length + queue.length} EVENTS</Text></View></View>
    {timelineEvents.length ? timelineEvents.map(event => {
      const tint = event.team === 'red' ? RED : BLUE;
      const cardEvent = event.type !== 'goal'; const label = event.type === 'yellow_card' ? event.suspensionMinutes ? 'Second yellow · red' : 'Yellow card' : event.type === 'red_card' ? 'Red card' : 'Goal';
      return <View key={event.clientEventId} style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.eventIcon, { backgroundColor: cardEvent ? event.type === 'yellow_card' ? 'rgba(244,197,66,.18)' : 'rgba(239,68,68,.18)' : `${tint}22` }]}>{cardEvent ? <View style={[styles.timelineCard, { backgroundColor: event.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} /> : <Feather name="award" size={16} color={tint} />}</View><View style={{ flex: 1 }}><Text style={[styles.eventText, { color: colors.foreground }]}>{event.scorerName} · {label}{event.suspensionMinutes ? ` · ${event.suspensionMinutes} min timeout` : ''} <Text style={{ color: tint }}>({event.team.toUpperCase()})</Text></Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.pending ? 'Saved on this phone · waiting to sync' : `${event.period === 1 ? '1ST HALF' : '2ND HALF'} · ${event.minute}′`}{event.assistName ? ` · Assist: ${event.assistName}` : ''}</Text></View>{event.pending ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove unsynced ${label.toLowerCase()} for ${event.scorerName}`} onPress={() => void removeQueuedGoal(event.clientEventId)} style={styles.undo}><Feather name="x" size={16} color="#F5C451" /></Pressable> : match.liveStatus === 'full_time' ? <View accessibilityLabel="Final match event" style={styles.undo}><Feather name="check" size={15} color={colors.mutedForeground} /></View> : <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${label.toLowerCase()} for ${event.scorerName}`} disabled={busy} onPress={() => void undoGoal(event as MatchEvent)} style={styles.undo}><Feather name="rotate-ccw" size={15} color={colors.mutedForeground} /></Pressable>}</View>;
    }) : <View style={[styles.emptyTimeline, { borderColor: colors.border }]}><Feather name="activity" size={18} color={colors.mutedForeground} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals and assists will appear here.</Text></View>}
    <Modal transparent visible={Boolean(cardConfirmation)} animationType="fade" onRequestClose={() => setCardConfirmation(null)}><View style={styles.modalShade}><View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.confirmCardSymbol, { backgroundColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} /><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: 'center' }]}>Confirm {cardConfirmation?.type === 'yellow_card' ? 'yellow' : 'red'} card?</Text><Text style={[styles.helper, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>{cardConfirmation?.player.firstName} · {cardConfirmation?.player.team.toUpperCase()} team. A second yellow is a sending-off. Red-card timeout: 15 minutes; a later red card: 30 minutes.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => setCardConfirmation(null)} style={[styles.confirmButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 12 }}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={() => { if (cardConfirmation) void recordEvent(cardConfirmation.type, cardConfirmation.player); }} style={[styles.confirmButton, { borderColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444', backgroundColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]}><Text style={{ color: '#111827', fontWeight: '900', fontSize: 12 }}>{busy ? 'Saving…' : `Confirm ${cardConfirmation?.type === 'yellow_card' ? 'yellow' : 'red'} card`}</Text></Pressable></View></View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  minuteReminder: { minHeight: 44, backgroundColor: '#FFD84D', borderRadius: 13, marginTop: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 }, minuteReminderText: { color: '#120A33', fontSize: 11, fontWeight: '900', flex: 1 },
  admissionCard: { minHeight: 78, borderWidth: 1, borderRadius: 17, padding: 11, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 9 }, admissionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, admitButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 7 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, title: { fontFamily: 'Georgia', fontSize: 26, marginTop: 5 }, subtitle: { fontSize: 10, marginTop: 4 }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scoreCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 18 }, scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, livePill: { minHeight: 29, borderRadius: 20, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, clock: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 15 }, teamBox: { flex: 1, minHeight: 123, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 9 }, teamDot: { width: 9, height: 9, borderRadius: 5 }, teamName: { fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginTop: 5 }, scoreNumber: { fontSize: 46, lineHeight: 53, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreDash: { fontSize: 19, fontWeight: '700' }, syncHint: { fontSize: 8, fontWeight: '700' }, phaseButton: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14 }, phaseButtonText: { fontSize: 12, fontWeight: '900' }, fullTimeNote: { textAlign: 'center', fontSize: 11, fontWeight: '800', marginTop: 17 },
  rostersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 9 }, teamBalanceCard: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }, teamBalanceTitle: { fontSize: 12, fontWeight: '900' }, balanceButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, balanceButtonText: { fontSize: 10, fontWeight: '900' }, rosterColumns: { flexDirection: 'row', gap: 9 }, rosterCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 9, paddingTop: 10, paddingBottom: 4 }, rosterTeamHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 5 }, rosterTeamName: { fontSize: 10, fontWeight: '900', letterSpacing: 1, flex: 1 }, rosterCount: { fontSize: 10, fontWeight: '800' }, rosterPlayer: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, gap: 4 }, playerIdentity: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, avatar: { width: 29, height: 29, borderRadius: 15 }, initialsAvatar: { alignItems: 'center', justifyContent: 'center' }, cardBadges: { flexDirection: 'row', gap: 3, marginTop: 3 }, cardBadge: { width: 7, height: 10, borderRadius: 2 }, cardActions: { flexDirection: 'row', gap: 4 }, cardAction: { width: 30, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, cardActionText: { color: '#111827', fontSize: 11, fontWeight: '900' }, movePlayerButton: { width: 55, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1 }, movePlayerText: { fontSize: 7, fontWeight: '900', letterSpacing: .5 }, timeoutText: { color: '#FF5364', fontSize: 8, fontWeight: '900', marginTop: 2 }, emptyRoster: { fontSize: 9, paddingVertical: 9 }, timelineCard: { width: 12, height: 17, borderRadius: 3 }, modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,.66)', justifyContent: 'center', alignItems: 'center', padding: 24 }, confirmCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' }, confirmCardSymbol: { width: 24, height: 34, borderRadius: 5, marginBottom: 13 }, confirmActions: { flexDirection: 'row', gap: 9, marginTop: 19, width: '100%' }, confirmButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  goalCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 }, sectionTitle: { fontSize: 15, fontWeight: '900' }, helper: { fontSize: 10, lineHeight: 15, marginTop: 4 }, teamChoices: { flexDirection: 'row', gap: 9, marginTop: 12 }, teamChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, playerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }, fieldLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 13 }, playerChoice: { minHeight: 42, maxWidth: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, justifyContent: 'center' }, goalButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }, goalButtonText: { fontSize: 11, fontWeight: '900' },
  connectionNotice: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, notice: { fontSize: 10, lineHeight: 15, marginTop: 9 }, timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }, eventCount: { minHeight: 26, borderRadius: 20, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }, eventRow: { minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }, eventIcon: { height: 34, width: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, eventText: { fontSize: 11, fontWeight: '800' }, eventMeta: { fontSize: 9, marginTop: 4 }, undo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, emptyTimeline: { minHeight: 70, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
