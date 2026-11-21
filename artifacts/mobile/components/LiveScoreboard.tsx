import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';

export type LiveView = { liveStatus: 'scheduled' | 'first_half' | 'halftime' | 'second_half' | 'full_time'; score: { red: number; blue: number }; events: { type: 'goal' | 'yellow_card' | 'red_card'; team: 'red' | 'blue'; period: number; minute: number; scorerUserId: string; scorerName: string; assistName: string | null; assistUserId?: string | null }[] };

export function LiveScoreboard({ matchId, compact = false, showAllEvents = false, onSnapshot }: { matchId: string; compact?: boolean; showAllEvents?: boolean; onSnapshot?: (snapshot: LiveView) => void }) {
  const colors = useColors(); const [snapshot, setSnapshot] = useState<LiveView | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/matches/${matchId}/live`, { headers: { 'Cache-Control': 'no-cache' } });
      if (response.ok) { const next = await response.json() as LiveView; setSnapshot(next); onSnapshot?.(next); }
    } catch { /* Keep the last score visible while temporarily offline. */ }
  }, [matchId, onSnapshot]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (snapshot?.liveStatus !== 'full_time') void load(); }, 3000);
    return () => clearInterval(timer);
  }, [load, snapshot?.liveStatus]));
  if (!snapshot || snapshot.liveStatus === 'scheduled') return null;
  const live = snapshot.liveStatus === 'first_half' || snapshot.liveStatus === 'second_half';
  return <View accessibilityLabel={`Live score, red ${snapshot.score.red}, blue ${snapshot.score.blue}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, compact && styles.compact]}>
    <View style={styles.header}><View style={[styles.badge, { backgroundColor: live ? 'rgba(255,83,100,.15)' : colors.secondary }]}><View style={[styles.dot, { backgroundColor: live ? '#FF5364' : colors.mutedForeground }]} /><Text style={{ color: live ? '#FF5364' : colors.mutedForeground, fontSize: 8, fontWeight: '900', letterSpacing: .9 }}>{snapshot.liveStatus.replace('_', ' ').toUpperCase()}</Text></View><Feather name="activity" size={14} color={colors.primary} /></View>
    <View style={styles.scoreLine}><Text style={[styles.team, { color: '#FF5364' }]}>RED</Text><Text style={[styles.score, { color: colors.foreground }]}>{snapshot.score.red}</Text><Text style={[styles.divider, { color: colors.mutedForeground }]}>–</Text><Text style={[styles.score, { color: colors.foreground }]}>{snapshot.score.blue}</Text><Text style={[styles.team, { color: '#579BFF' }]}>BLUE</Text></View>
    {snapshot.events.length ? <View style={[styles.eventList, { borderTopColor: colors.border }]}>{(showAllEvents ? [...snapshot.events].reverse() : snapshot.events.slice(-4).reverse()).map((event, index) => { const card = event.type !== 'goal'; const color = event.type === 'yellow_card' ? '#F4C542' : event.type === 'red_card' ? '#EF4444' : event.team === 'red' ? '#FF5364' : '#579BFF'; const label = event.type === 'yellow_card' ? 'Yellow card' : event.type === 'red_card' ? 'Red card' : 'Goal'; return <View key={`${event.period}-${event.minute}-${event.scorerName}-${index}`} style={styles.lastEvent}><Feather name={card ? 'alert-triangle' : 'award'} size={13} color={color} /><Text numberOfLines={1} style={[styles.eventText, { color: colors.mutedForeground }]}>{event.scorerName} · {label} · {event.minute}′{event.assistName ? ` · Assist ${event.assistName}` : ''}</Text></View>; })}</View> : <Text style={[styles.eventText, { color: colors.mutedForeground, textAlign: 'center' }]}>No match events yet</Text>}
  </View>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 12 }, compact: { marginTop: 10, padding: 10 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, badge: { minHeight: 25, borderRadius: 20, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }, dot: { width: 6, height: 6, borderRadius: 3 }, scoreLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }, team: { fontSize: 8, fontWeight: '900', letterSpacing: .8 }, score: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] }, divider: { fontSize: 17 }, eventList: { borderTopWidth: 1, marginTop: 8, paddingTop: 1 }, lastEvent: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 6 }, eventText: { fontSize: 9, flex: 1 } });
