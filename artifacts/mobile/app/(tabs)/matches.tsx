import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, getListMatchesQueryKey, useGetCurrentUser, useListMatches } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function MatchesScreen() {
  const colors = useColors(); const router = useRouter(); const [query, setQuery] = useState(''); const [filter, setFilter] = useState('All games'); const [dayFilter, setDayFilter] = useState('Any day');
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = useListMatches({ query: { queryKey: getListMatchesQueryKey() } });
  const neighborhoods = useMemo(() => ['All games', ...Array.from(new Set((matches.data || []).map(match => match.neighborhood)))], [matches.data]);
  const visible = useMemo(() => (matches.data || []).filter(match => {
    const startsAt = new Date(match.startsAt); const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1); const dayAfter = new Date(tomorrow); dayAfter.setDate(tomorrow.getDate() + 1); const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const dateMatches = dayFilter === 'Any day' || (dayFilter === 'Today' && startsAt >= today && startsAt < tomorrow) || (dayFilter === 'Tomorrow' && startsAt >= tomorrow && startsAt < dayAfter) || (dayFilter === 'This week' && startsAt >= today && startsAt < weekEnd);
    return dateMatches && (filter === 'All games' || match.neighborhood === filter) && `${match.venueName} ${match.neighborhood}`.toLowerCase().includes(query.toLowerCase());
  }), [matches.data, filter, query, dayFilter]);
  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}><BrandHeader user={user.data} subtitle="FIND YOUR GAME" />
    <Text style={[styles.kicker, { color: colors.primary }]}>MADE FOR THE GAME</Text><Text style={[styles.title, { color: colors.foreground }]}>Discover matches.</Text><Text style={[styles.sub, { color: colors.mutedForeground }]}>Organized 7v7 football, across Riyadh.</Text>
     <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput accessibilityLabel="Search matches by venue or neighborhood" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Venue or neighborhood" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /></View>
    <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>WHEN</Text><View style={styles.filters}>{['Any day', 'Today', 'Tomorrow', 'This week'].map(item => <Pressable key={item} accessibilityRole="button" onPress={() => setDayFilter(item)} style={[styles.filter, { backgroundColor: dayFilter === item ? colors.primary : colors.card, borderColor: dayFilter === item ? colors.primary : colors.border }]}><Text style={{ color: dayFilter === item ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{item}</Text></Pressable>)}</View>
    <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>AREA</Text><View style={styles.filters}>{neighborhoods.map(item => <Pressable key={item} accessibilityRole="button" onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: filter === item ? colors.primary : colors.card, borderColor: filter === item ? colors.primary : colors.border }]}><Text style={{ color: filter === item ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{item}</Text></Pressable>)}</View>
    {matches.isLoading ? <LoadingState /> : matches.isError ? <EmptyState title="Matches are out of reach" body="We couldn't load the schedule. Try again in a moment." icon="wifi-off" action="Retry" onAction={() => matches.refetch()} /> : visible.length ? visible.map(match => <MatchCard key={match.id} match={match} onPress={() => router.push(`/match/${match.id}`)} />) : <EmptyState icon="map-pin" title={query || filter !== 'All games' ? 'No games match that search.' : 'No matches scheduled yet.'} body={query || filter !== 'All games' ? 'Try another Riyadh neighborhood or clear your search.' : 'New games will appear here as soon as they are published.'} /> }
  </Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 12 }, title: { fontSize: 31, fontFamily: 'Georgia', marginTop: 8 }, sub: { fontSize: 13, marginTop: 6, marginBottom: 22 }, searchBox: { height: 50, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }, searchInput: { flex: 1, fontSize: 13 }, filterLabel: { fontSize: 9, letterSpacing: 1.4, fontWeight: '700', marginTop: 2 }, filters: { flexDirection: 'row', gap: 8, marginVertical: 10, flexWrap: 'wrap' }, filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1, minHeight: 40, justifyContent: 'center' } });

