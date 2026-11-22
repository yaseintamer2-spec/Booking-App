import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { loadSampleParticipants, matchRegistrationMock } from '@/data/matchRegistrationMock';

type Team = 'red' | 'blue';
type Player = { userId: string; firstName: string; avatarUrl: string | null; pitchSlot: number | null; team: Team };
type EventType = 'goal' | 'yellow_card' | 'red_card';
type MatchEvent = { id: string; clientEventId: string; type: EventType; team: Team; period: number; minute: number; scorerUserId: string; scorerName: string; assistUserId: string | null; assistName: string | null; createdAt: string };
type PendingEvent = { clientEventId: string; type: EventType; team: Team; scorerUserId: string; assistUserId: string | null; occurredAt: string };
type LiveSnapshot = { id: string; venueName: string; neighborhood: string; durationMinutes: number; refereeUserId: string | null; refereeName: string | null; liveStatus: 'scheduled' | 'first_half' | 'halftime' | 'second_half' | 'full_time'; liveStartedAt: string | null; livePhaseStartedAt: string | null; liveFirstHalfEndedAt: string | null; liveSecondHalfStartedAt: string | null; liveEndedAt: string | null; score: { red: number; blue: number }; players: Player[]; events: MatchEvent[] };
const RED = '#FF5364';
const BLUE = '#579BFF';
const LOCAL_LIVE_MATCH_KEY = 'kickoff.local-preview.live-match.v1';

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
    score: { red: 0, blue: 0 },
    players: players.map((player, index) => ({
      userId: player.userId,
      firstName: player.firstName,
      avatarUrl: player.avatarUrl,
      pitchSlot: player.pitchSlot ?? index,
      team: index % 2 === 0 ? 'red' : 'blue',
    })),
    events: [],
  };
}

export default function RefereeMatchScreen() {
  const colors = useColors(); const { getToken } = useAuth();
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

  const changePhase = async () => {
    if (!match || !phaseAction || busy) return;
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
    const pending = [...queue, event];
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
      const latest = await request(`/matches/${match.id}/live/events`, { method: 'POST', body: JSON.stringify(event) }) as LiveSnapshot;
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

  if (loading && !match) return <Screen><BrandHeader back subtitle="LIVE MATCH CONTROL" /><ActivityIndicator color={colors.primary} /></Screen>;
  if (error && !match) return <Screen><BrandHeader back subtitle="LIVE MATCH CONTROL" /><EmptyState icon="alert-circle" title="Could not open match controls." body={error} action="Try again" onAction={() => void syncLive()} /></Screen>;
  if (!match) return null;
  const redScore = match.score.red + pendingRed; const blueScore = match.score.blue + pendingBlue;
  const activePhase = match.liveStatus === 'first_half' || match.liveStatus === 'second_half';
  const canRecord = activePhase && Boolean(team && scorer) && !busy;
  const cardsByPlayer = (playerId: string) => match.events.filter(event => event.scorerUserId === playerId && (event.type === 'yellow_card' || event.type === 'red_card'));

  return <Screen refreshing={false} onRefresh={() => { void syncLive(); }}>
    <BrandHeader back subtitle="LIVE MATCH CONTROL" />
    <View style={styles.titleRow}><View style={{ flex: 1 }}><Text style={[styles.kicker, { color: colors.primary }]}>REFEREE DESK</Text><Text style={[styles.title, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{match.neighborhood}{match.refereeName ? ` · ${match.refereeName}` : ''}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh live match" onPress={() => void syncLive()} style={[styles.refresh, { borderColor: colors.border }]}><Feather name="refresh-cw" size={17} color={colors.primary} /></Pressable></View>

    <View style={[styles.scoreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.scoreHeader}><View style={[styles.livePill, { backgroundColor: activePhase ? 'rgba(255,83,100,.16)' : colors.secondary }]}><View style={[styles.liveDot, { backgroundColor: activePhase ? RED : colors.mutedForeground }]} /><Text style={{ color: activePhase ? RED : colors.mutedForeground, fontSize: 9, fontWeight: '900', letterSpacing: 1 }}>{match.liveStatus.replace('_', ' ').toUpperCase()}</Text></View><Text style={[styles.clock, { color: colors.foreground }]}>{displayClock()}</Text></View>
      <View style={styles.scoreRow}><View style={[styles.teamBox, { backgroundColor: 'rgba(255,83,100,.12)', borderColor: 'rgba(255,83,100,.45)' }]}><View style={[styles.teamDot, { backgroundColor: RED }]} /><Text style={[styles.teamName, { color: RED }]}>RED</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{redScore}</Text>{pendingRed ? <Text style={[styles.syncHint, { color: RED }]}>+{pendingRed} waiting to sync</Text> : null}</View><Text style={[styles.scoreDash, { color: colors.mutedForeground }]}>—</Text><View style={[styles.teamBox, { backgroundColor: 'rgba(87,155,255,.12)', borderColor: 'rgba(87,155,255,.45)' }]}><View style={[styles.teamDot, { backgroundColor: BLUE }]} /><Text style={[styles.teamName, { color: BLUE }]}>BLUE</Text><Text style={[styles.scoreNumber, { color: colors.foreground }]}>{blueScore}</Text>{pendingBlue ? <Text style={[styles.syncHint, { color: BLUE }]}>+{pendingBlue} waiting to sync</Text> : null}</View></View>
      {phaseAction ? <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={() => void changePhase()} style={[styles.phaseButton, { backgroundColor: colors.primary, opacity: busy ? .6 : 1 }]}><Feather name={phaseAction.icon as never} size={17} color={colors.primaryForeground} /><Text style={[styles.phaseButtonText, { color: colors.primaryForeground }]}>{busy ? 'Saving…' : phaseAction.label}</Text></Pressable> : <Text style={[styles.fullTimeNote, { color: colors.primary }]}>Final score saved · match complete</Text>}
    </View>

    <View style={styles.rostersHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Team rosters</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>Tap a player to select them. Confirm cards as they happen.</Text></View><View style={[styles.eventCount, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 9, fontWeight: '800' }}>{match.players.length} PLAYERS</Text></View></View>
    <View style={styles.rosterColumns}>{(['red', 'blue'] as Team[]).map(rosterTeam => {
      const tint = rosterTeam === 'red' ? RED : BLUE;
      const players = match.players.filter(player => player.team === rosterTeam);
      return <View key={rosterTeam} style={[styles.rosterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rosterTeamHeader}><View style={[styles.teamDot, { backgroundColor: tint }]} /><Text style={[styles.rosterTeamName, { color: tint }]}>{rosterTeam.toUpperCase()}</Text><Text style={[styles.rosterCount, { color: colors.mutedForeground }]}>{players.length}</Text></View>
        {players.map(player => {
          const playerCards = cardsByPlayer(player.userId);
          const redCarded = playerCards.some(event => event.type === 'red_card');
          return <View key={player.userId} style={[styles.rosterPlayer, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Select ${player.firstName} from ${rosterTeam} team`} accessibilityState={{ selected: scorerId === player.userId }} disabled={redCarded} onPress={() => { setTeam(rosterTeam); setScorerId(player.userId); setAssistId(''); }} style={styles.playerIdentity}>
              {player.avatarUrl ? <Image source={{ uri: player.avatarUrl }} accessibilityLabel={`${player.firstName}'s profile picture`} style={styles.avatar} /> : <View style={[styles.avatar, styles.initialsAvatar, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 10, fontWeight: '900' }}>{player.firstName.slice(0, 1).toUpperCase()}</Text></View>}
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: redCarded ? colors.mutedForeground : colors.foreground, fontSize: 10, fontWeight: '800' }}>{player.firstName}</Text>{playerCards.length ? <View style={styles.cardBadges}>{playerCards.map(card => <View key={card.id} style={[styles.cardBadge, { backgroundColor: card.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} />)}</View> : null}</View>
            </Pressable>
            {activePhase && !redCarded ? <View style={styles.cardActions}><Pressable accessibilityRole="button" accessibilityLabel={`Confirm yellow card for ${player.firstName}`} onPress={() => setCardConfirmation({ player, type: 'yellow_card' })} style={[styles.cardAction, { backgroundColor: '#F4C542' }]}><Text style={styles.cardActionText}>Y</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm red card for ${player.firstName}`} onPress={() => setCardConfirmation({ player, type: 'red_card' })} style={[styles.cardAction, { backgroundColor: '#EF4444' }]}><Text style={styles.cardActionText}>R</Text></Pressable></View> : null}
          </View>;
        })}
        {!players.length ? <Text style={[styles.emptyRoster, { color: colors.mutedForeground }]}>No players assigned</Text> : null}
      </View>;
    })}</View>

    {activePhase ? <View style={[styles.goalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Record a goal</Text>
      <Text style={[styles.helper, { color: colors.mutedForeground }]}>Choose the scoring team, then the player. Assist is optional.</Text>
      <View style={styles.teamChoices}>{(['red', 'blue'] as Team[]).map(option => { const selected = team === option; const tint = option === 'red' ? RED : BLUE; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setTeam(option); setScorerId(''); setAssistId(''); }} style={[styles.teamChoice, { borderColor: selected ? tint : colors.border, backgroundColor: selected ? `${tint}20` : colors.background }]}><View style={[styles.teamDot, { backgroundColor: tint }]} /><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11, fontWeight: '900' }}>{option.toUpperCase()} TEAM</Text><Text style={{ color: selected ? tint : colors.mutedForeground, fontSize: 11 }}>{selected ? '✓' : ''}</Text></Pressable>; })}</View>
      {team ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>SCORER</Text><View style={styles.playerChoices}>{roster.filter(player => !cardsByPlayer(player.userId).some(event => event.type === 'red_card')).map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: scorerId === player.userId }} onPress={() => { setScorerId(player.userId); if (assistId === player.userId) setAssistId(''); }} style={[styles.playerChoice, { borderColor: scorerId === player.userId ? colors.primary : colors.border, backgroundColor: scorerId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: scorerId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View>
        {scorer ? <><Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 10 }]}>ASSIST · OPTIONAL</Text><View style={styles.playerChoices}><Pressable accessibilityRole="button" accessibilityState={{ selected: !assistId }} onPress={() => setAssistId('')} style={[styles.playerChoice, { borderColor: !assistId ? colors.primary : colors.border, backgroundColor: !assistId ? colors.accent : colors.background }]}><Text style={{ color: !assistId ? colors.primary : colors.mutedForeground, fontSize: 10, fontWeight: '700' }}>No assist</Text></Pressable>{roster.filter(player => player.userId !== scorerId).map(player => <Pressable key={player.userId} accessibilityRole="button" accessibilityState={{ selected: assistId === player.userId }} onPress={() => setAssistId(player.userId)} style={[styles.playerChoice, { borderColor: assistId === player.userId ? colors.primary : colors.border, backgroundColor: assistId === player.userId ? colors.accent : colors.background }]}><Text numberOfLines={1} style={{ color: assistId === player.userId ? colors.primary : colors.foreground, fontSize: 10, fontWeight: '700' }}>{player.firstName}</Text></Pressable>)}</View></> : null}
      </> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canRecord, busy }} disabled={!canRecord} onPress={() => void recordGoal()} style={[styles.goalButton, { backgroundColor: team === 'red' ? RED : team === 'blue' ? BLUE : colors.secondary, opacity: canRecord ? 1 : .48 }]}><Feather name="plus-circle" size={18} color={team ? '#07120D' : colors.mutedForeground} /><Text style={[styles.goalButtonText, { color: team ? '#07120D' : colors.mutedForeground }]}>{busy ? 'Saving goal…' : scorer ? `Record ${scorer.firstName}’s goal` : 'Select team and scorer'}</Text></Pressable>
    </View> : null}

    {queue.length ? <View accessibilityRole="status" style={[styles.connectionNotice, { backgroundColor: 'rgba(245,196,81,.12)', borderColor: 'rgba(245,196,81,.4)' }]}><Feather name="wifi-off" size={15} color="#F5C451" /><Text style={{ color: '#F5C451', fontSize: 10, fontWeight: '700', flex: 1 }}>{queue.length} event{queue.length === 1 ? '' : 's'} saved on this phone, waiting for internet to sync.</Text></View> : null}
    {notice ? <Text accessibilityRole="status" style={[styles.notice, { color: queue.length ? '#F5C451' : colors.mutedForeground }]}>{notice}</Text> : null}

    <View style={styles.timelineHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Match timeline</Text><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals and cards sync to players every few seconds.</Text></View><View style={[styles.eventCount, { backgroundColor: colors.secondary }]}><Text style={{ color: colors.foreground, fontSize: 9, fontWeight: '800' }}>{match.events.length + queue.length} EVENTS</Text></View></View>
    {match.events.length || queue.length ? [...match.events.map(event => ({ ...event, pending: false })), ...queue.map(goal => ({ id: goal.clientEventId, clientEventId: goal.clientEventId, type: goal.type, team: goal.team, period: 0, minute: 0, scorerUserId: goal.scorerUserId, scorerName: match.players.find(player => player.userId === goal.scorerUserId)?.firstName || 'Player', assistUserId: goal.assistUserId, assistName: null, createdAt: goal.occurredAt, pending: true }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(event => {
      const tint = event.team === 'red' ? RED : BLUE;
      const cardEvent = event.type !== 'goal'; const label = event.type === 'yellow_card' ? 'Yellow card' : event.type === 'red_card' ? 'Red card' : 'Goal';
      return <View key={event.clientEventId} style={[styles.eventRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.eventIcon, { backgroundColor: cardEvent ? event.type === 'yellow_card' ? 'rgba(244,197,66,.18)' : 'rgba(239,68,68,.18)' : `${tint}22` }]}>{cardEvent ? <View style={[styles.timelineCard, { backgroundColor: event.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} /> : <Feather name="award" size={16} color={tint} />}</View><View style={{ flex: 1 }}><Text style={[styles.eventText, { color: colors.foreground }]}>{event.scorerName} · {label} <Text style={{ color: tint }}>({event.team.toUpperCase()})</Text></Text><Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.pending ? 'Saved on this phone · waiting to sync' : `${event.period === 1 ? '1ST HALF' : '2ND HALF'} · ${event.minute}′`}{event.assistName ? ` · Assist: ${event.assistName}` : ''}</Text></View>{event.pending ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove unsynced ${label.toLowerCase()} for ${event.scorerName}`} onPress={() => void removeQueuedGoal(event.clientEventId)} style={styles.undo}><Feather name="x" size={16} color="#F5C451" /></Pressable> : match.liveStatus === 'full_time' ? <View accessibilityLabel="Final match event" style={styles.undo}><Feather name="check" size={15} color={colors.mutedForeground} /></View> : <Pressable accessibilityRole="button" accessibilityLabel={`Undo ${label.toLowerCase()} for ${event.scorerName}`} disabled={busy} onPress={() => void undoGoal(event as MatchEvent)} style={styles.undo}><Feather name="rotate-ccw" size={15} color={colors.mutedForeground} /></Pressable>}</View>;
    }) : <View style={[styles.emptyTimeline, { borderColor: colors.border }]}><Feather name="activity" size={18} color={colors.mutedForeground} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Goals and assists will appear here.</Text></View>}
    <Modal transparent visible={Boolean(cardConfirmation)} animationType="fade" onRequestClose={() => setCardConfirmation(null)}><View style={styles.modalShade}><View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.confirmCardSymbol, { backgroundColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]} /><Text style={[styles.sectionTitle, { color: colors.foreground, textAlign: 'center' }]}>Confirm {cardConfirmation?.type === 'yellow_card' ? 'yellow' : 'red'} card?</Text><Text style={[styles.helper, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>{cardConfirmation?.player.firstName} · {cardConfirmation?.player.team.toUpperCase()} team. This will be recorded at the current match time.</Text><View style={styles.confirmActions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => setCardConfirmation(null)} style={[styles.confirmButton, { borderColor: colors.border }]}><Text style={{ color: colors.foreground, fontWeight: '800', fontSize: 12 }}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={() => { if (cardConfirmation) void recordEvent(cardConfirmation.type, cardConfirmation.player); }} style={[styles.confirmButton, { borderColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444', backgroundColor: cardConfirmation?.type === 'yellow_card' ? '#F4C542' : '#EF4444' }]}><Text style={{ color: '#111827', fontWeight: '900', fontSize: 12 }}>{busy ? 'Saving…' : `Confirm ${cardConfirmation?.type === 'yellow_card' ? 'yellow' : 'red'} card`}</Text></Pressable></View></View></View></Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 7 }, kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 }, title: { fontFamily: 'Georgia', fontSize: 26, marginTop: 5 }, subtitle: { fontSize: 10, marginTop: 4 }, refresh: { width: 44, height: 44, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scoreCard: { borderWidth: 1, borderRadius: 20, padding: 15, marginTop: 18 }, scoreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, livePill: { minHeight: 29, borderRadius: 20, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 }, liveDot: { width: 7, height: 7, borderRadius: 4 }, clock: { fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginTop: 15 }, teamBox: { flex: 1, minHeight: 123, borderWidth: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center', padding: 9 }, teamDot: { width: 9, height: 9, borderRadius: 5 }, teamName: { fontSize: 9, letterSpacing: 1.2, fontWeight: '900', marginTop: 5 }, scoreNumber: { fontSize: 46, lineHeight: 53, fontWeight: '900', fontVariant: ['tabular-nums'] }, scoreDash: { fontSize: 19, fontWeight: '700' }, syncHint: { fontSize: 8, fontWeight: '700' }, phaseButton: { minHeight: 50, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 14 }, phaseButtonText: { fontSize: 12, fontWeight: '900' }, fullTimeNote: { textAlign: 'center', fontSize: 11, fontWeight: '800', marginTop: 17 },
  rostersHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 9 }, rosterColumns: { flexDirection: 'row', gap: 9 }, rosterCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 9, paddingTop: 10, paddingBottom: 4 }, rosterTeamHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 5 }, rosterTeamName: { fontSize: 10, fontWeight: '900', letterSpacing: 1, flex: 1 }, rosterCount: { fontSize: 10, fontWeight: '800' }, rosterPlayer: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, gap: 4 }, playerIdentity: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 }, avatar: { width: 29, height: 29, borderRadius: 15 }, initialsAvatar: { alignItems: 'center', justifyContent: 'center' }, cardBadges: { flexDirection: 'row', gap: 3, marginTop: 3 }, cardBadge: { width: 7, height: 10, borderRadius: 2 }, cardActions: { flexDirection: 'row', gap: 4 }, cardAction: { width: 30, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, cardActionText: { color: '#111827', fontSize: 11, fontWeight: '900' }, emptyRoster: { fontSize: 9, paddingVertical: 9 }, timelineCard: { width: 12, height: 17, borderRadius: 3 }, modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,.66)', justifyContent: 'center', alignItems: 'center', padding: 24 }, confirmCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center' }, confirmCardSymbol: { width: 24, height: 34, borderRadius: 5, marginBottom: 13 }, confirmActions: { flexDirection: 'row', gap: 9, marginTop: 19, width: '100%' }, confirmButton: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  goalCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 }, sectionTitle: { fontSize: 15, fontWeight: '900' }, helper: { fontSize: 10, lineHeight: 15, marginTop: 4 }, teamChoices: { flexDirection: 'row', gap: 9, marginTop: 12 }, teamChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, playerChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }, fieldLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 13 }, playerChoice: { minHeight: 42, maxWidth: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, justifyContent: 'center' }, goalButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }, goalButtonText: { fontSize: 11, fontWeight: '900' },
  connectionNotice: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, notice: { fontSize: 10, lineHeight: 15, marginTop: 9 }, timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 }, eventCount: { minHeight: 26, borderRadius: 20, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' }, eventRow: { minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }, eventIcon: { height: 34, width: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, eventText: { fontSize: 11, fontWeight: '800' }, eventMeta: { fontSize: 9, marginTop: 4 }, undo: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, emptyTimeline: { minHeight: 70, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
