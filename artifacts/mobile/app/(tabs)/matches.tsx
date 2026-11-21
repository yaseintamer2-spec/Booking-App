import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { getGetCurrentUserQueryKey, getListMatchesQueryKey, useGetCurrentUser, useListMatches } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { getRecommendedMatchAgeGroup } from '@/lib/matchAge';
import { sampleMatchListing } from '@/data/matchRegistrationMock';

type DayFilter = 'Any day' | 'Today' | 'Tomorrow' | 'This week';
type SortOption = 'soonest' | 'lowest-price' | 'highest-price' | 'most-spots';
type PriceFilter = 'any' | 'under-30' | '30-50' | '50-plus';
type SpotFilter = 0 | 3 | 6;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Soonest', value: 'soonest' },
  { label: 'Lowest price', value: 'lowest-price' },
  { label: 'Highest price', value: 'highest-price' },
  { label: 'Most spots', value: 'most-spots' },
];
const PRICE_OPTIONS: { label: string; value: PriceFilter }[] = [
  { label: 'Any price', value: 'any' },
  { label: 'Under SAR 30', value: 'under-30' },
  { label: 'SAR 30–50', value: '30-50' },
  { label: 'SAR 50+', value: '50-plus' },
];
const SPOT_OPTIONS: { label: string; value: SpotFilter }[] = [
  { label: 'Any availability', value: 0 },
  { label: '3+ spots', value: 3 },
  { label: '6+ spots', value: 6 },
];

export default function MatchesScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('All games');
  const [dayFilter, setDayFilter] = useState<DayFilter>('Any day');
  const [sortBy, setSortBy] = useState<SortOption>('soonest');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('any');
  const [spotFilter, setSpotFilter] = useState<SpotFilter>(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { getToken, isSignedIn } = useAuth();
  const [matchAlertsEnabled, setMatchAlertsEnabled] = useState(false);
  const [matchAlertsLoading, setMatchAlertsLoading] = useState(true);
  const [matchAlertsBusy, setMatchAlertsBusy] = useState(false);
  const [matchAlertsMessage, setMatchAlertsMessage] = useState('');
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [playerAge, setPlayerAge] = useState<number | null>(null);

  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = useListMatches({ query: { queryKey: getListMatchesQueryKey(), retry: false, staleTime: 20_000 } });
  useEffect(() => { let active = true; if (!isSignedIn) { setPlayerAge(null); return () => { active = false; }; } void (async () => { try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/age`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active && response.ok) setPlayerAge(typeof result.age === 'number' ? result.age : null); } catch { if (active) setPlayerAge(null); } })(); return () => { active = false; }; }, [getToken, isSignedIn]);
  const recommendedAgeGroup = playerAge == null ? null : getRecommendedMatchAgeGroup(playerAge);
  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    const response = await fetch(`${apiBaseUrl}/api${path}`, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
    const payload = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Could not update match alerts.');
    return payload;
  }, [getToken]);
  const loadMatchAlertPreference = useCallback(async () => {
    if (!isSignedIn) {
      setMatchAlertsEnabled(false);
      setMatchAlertsLoading(false);
      return;
    }
    setMatchAlertsLoading(true);
    try {
      const result = await request('/me/match-alerts');
      setMatchAlertsEnabled(result.enabled === true);
      setMatchAlertsMessage('');
    } catch (error) {
      setMatchAlertsMessage(error instanceof Error ? error.message : 'Could not load alert settings.');
    } finally {
      setMatchAlertsLoading(false);
    }
  }, [isSignedIn, request]);
  useEffect(() => { void loadMatchAlertPreference(); }, [loadMatchAlertPreference]);

  const toggleMatchAlerts = async () => {
    if (!isSignedIn) {
      setMatchAlertsMessage('Sign in to get new-match alerts.');
      router.push('/(auth)/welcome');
      return;
    }
    if (matchAlertsBusy || matchAlertsLoading) return;
    setMatchAlertsBusy(true);
    setMatchAlertsMessage('');
    try {
      if (matchAlertsEnabled) {
        await request('/me/match-alerts', { method: 'DELETE' });
        setMatchAlertsEnabled(false);
        setMatchAlertsMessage('New-match alerts are off. You can turn them back on anytime.');
        return;
      }

      await request('/me/match-alerts', { method: 'POST' });
      setMatchAlertsEnabled(true);
      let message = 'In-app alerts are on. We’ll notify you when a new match is published.';
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        try {
          const permission = await Notifications.getPermissionsAsync();
          if (!permission.granted) {
            setPushPromptOpen(true);
            message = 'In-app alerts are on. Turn on notifications for kickoff reminders and new match updates.';
          } else {
            message = await registerForMatchPush();
          }
        } catch {
          message = 'In-app alerts are on. Push alert setup did not finish; you can still see new matches in Notifications.';
        }
      }
      setMatchAlertsMessage(message);
    } catch (error) {
      setMatchAlertsMessage(error instanceof Error ? error.message : 'Could not update match alerts. Try again.');
    } finally {
      setMatchAlertsBusy(false);
    }
  };
  const registerForMatchPush = async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'In-app alerts are on. New matches will appear in Notifications.';
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('match-updates', { name: 'Match updates', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return 'In-app alerts are on. Push notifications are optional; allow notifications anytime in device settings.';
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return 'In-app alerts are on. Push notifications need a configured app build.';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await request('/me/push-token', { method: 'POST', body: JSON.stringify({ token, platform: Platform.OS }) });
    return 'Notifications are on. We’ll remind you before kickoff and let you know when new matches are posted.';
  };
  const allowMatchPush = async () => {
    if (matchAlertsBusy) return;
    setMatchAlertsBusy(true);
    setMatchAlertsMessage('');
    try {
      setMatchAlertsMessage(await registerForMatchPush());
    } catch {
      setMatchAlertsMessage('In-app alerts are on. Push setup did not finish; you can still see updates in Notifications.');
    } finally {
      setMatchAlertsBusy(false);
      setPushPromptOpen(false);
    }
  };
  const neighborhoods = useMemo(() => ['All games', ...Array.from(new Set((matches.data || []).map(match => match.neighborhood)))], [matches.data]);
  const visible = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const needle = query.trim().toLowerCase();

    return (matches.data || []).filter(match => {
      const startsAt = new Date(match.startsAt);
      const dateMatches = dayFilter === 'Any day'
        || (dayFilter === 'Today' && startsAt >= today && startsAt < tomorrow)
        || (dayFilter === 'Tomorrow' && startsAt >= tomorrow && startsAt < dayAfter)
        || (dayFilter === 'This week' && startsAt >= today && startsAt < weekEnd);
      const areaMatches = areaFilter === 'All games' || match.neighborhood === areaFilter;
      const searchMatches = `${match.venueName} ${match.neighborhood} ${match.address}`.toLowerCase().includes(needle);
      const priceMatches = priceFilter === 'any'
        || (priceFilter === 'under-30' && match.priceHalalas < 3000)
        || (priceFilter === '30-50' && match.priceHalalas >= 3000 && match.priceHalalas < 5000)
        || (priceFilter === '50-plus' && match.priceHalalas >= 5000);
      const spotsMatch = match.spotsRemaining >= spotFilter;
      return dateMatches && areaMatches && searchMatches && priceMatches && spotsMatch;
    }).sort((a, b) => {
      if (sortBy === 'lowest-price') return a.priceHalalas - b.priceHalalas || Date.parse(a.startsAt) - Date.parse(b.startsAt);
      if (sortBy === 'highest-price') return b.priceHalalas - a.priceHalalas || Date.parse(a.startsAt) - Date.parse(b.startsAt);
      if (sortBy === 'most-spots') return b.spotsRemaining - a.spotsRemaining || Date.parse(a.startsAt) - Date.parse(b.startsAt);
      return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    });
  }, [matches.data, areaFilter, query, dayFilter, priceFilter, spotFilter, sortBy]);

  const activeFilterCount = Number(areaFilter !== 'All games') + Number(dayFilter !== 'Any day') + Number(priceFilter !== 'any') + Number(spotFilter !== 0);
  const hasActiveFilters = activeFilterCount > 0 || query.trim().length > 0;
  const clearFilters = () => {
    setQuery('');
    setAreaFilter('All games');
    setDayFilter('Any day');
    setPriceFilter('any');
    setSpotFilter(0);
    setSortBy('soonest');
  };

  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="FIND YOUR GAME" />
    <Text style={[styles.kicker, { color: colors.primary }]}>MADE FOR THE GAME</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Discover matches.</Text>
    <Text style={[styles.sub, { color: colors.mutedForeground }]}>Organized 7v7 football, across Riyadh.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/player-age' as never)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.secondary, marginTop: 10 }}><Feather name="user" size={14} color={colors.primary} /><Text style={{ fontSize: 11, fontWeight: '700', color: colors.foreground }}>{playerAge == null ? 'Add your age for match recommendations' : `Age ${playerAge} · ${recommendedAgeGroup ? `recommended group ${recommendedAgeGroup.replace('-', '–')}` : 'edit age'}`}</Text></Pressable>

    <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name="search" size={17} color={colors.mutedForeground} />
      <TextInput accessibilityLabel="Search matches by venue, area, or address" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Venue, area, or address" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
    </View>

    <View style={[styles.alertRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.alertIcon, { backgroundColor: colors.secondary }]}><Feather name="bell" size={16} color={colors.primary} /></View>
      <View style={styles.alertCopy}>
        <Text style={[styles.alertTitle, { color: colors.foreground }]}>New match alerts</Text>
        <Text numberOfLines={2} style={[styles.alertDescription, { color: colors.mutedForeground }]}>{matchAlertsMessage || (matchAlertsEnabled ? 'Get reminders before kickoff and an alert when a new game is posted.' : 'Get reminders before kickoff and an alert when a new game is posted.')}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={matchAlertsEnabled ? 'Turn off new match alerts' : 'Alert me when a new match is available'} accessibilityState={{ disabled: matchAlertsLoading || matchAlertsBusy, selected: matchAlertsEnabled, busy: matchAlertsBusy }} disabled={matchAlertsLoading || matchAlertsBusy} onPress={() => void toggleMatchAlerts()} style={[styles.alertButton, { backgroundColor: matchAlertsEnabled ? colors.secondary : colors.primary, borderColor: matchAlertsEnabled ? colors.border : colors.primary, opacity: matchAlertsLoading || matchAlertsBusy ? 0.6 : 1 }]}>
        <Text style={[styles.alertButtonText, { color: matchAlertsEnabled ? colors.foreground : colors.primaryForeground }]}>{matchAlertsLoading ? 'Loading…' : matchAlertsBusy ? 'Saving…' : matchAlertsEnabled ? 'Alerts on' : 'Alert me'}</Text>
      </Pressable>
    </View>
    {matchAlertsMessage ? <Text accessibilityRole="status" style={[styles.alertStatus, { color: matchAlertsEnabled ? colors.primary : colors.mutedForeground }]}>{matchAlertsMessage}</Text> : null}

    <View style={styles.controlHeader}>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>SORT BY</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={filtersOpen ? 'Hide match filters' : 'Show match filters'} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(open => !open)} style={[styles.filterToggle, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="sliders" size={14} color={colors.primary} />
        <Text style={[styles.filterToggleText, { color: colors.foreground }]}>Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text>
        <Feather name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.mutedForeground} />
      </Pressable>
    </View>
    <View style={styles.filters}>
      {SORT_OPTIONS.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: sortBy === option.value }} onPress={() => setSortBy(option.value)} style={[styles.filter, { backgroundColor: sortBy === option.value ? colors.primary : colors.card, borderColor: sortBy === option.value ? colors.primary : colors.border }]}>
        <Text style={{ color: sortBy === option.value ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
      </Pressable>)}
    </View>

    {filtersOpen ? <View style={[styles.filterPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <FilterGroup label="WHEN" color={colors.mutedForeground}>
        {(['Any day', 'Today', 'Tomorrow', 'This week'] as DayFilter[]).map(item => <FilterChip key={item} label={item} selected={dayFilter === item} onPress={() => setDayFilter(item)} colors={colors} />)}
      </FilterGroup>
      <FilterGroup label="AREA" color={colors.mutedForeground}>
        {neighborhoods.map(item => <FilterChip key={item} label={item} selected={areaFilter === item} onPress={() => setAreaFilter(item)} colors={colors} />)}
      </FilterGroup>
      <FilterGroup label="PRICE PER PLAYER" color={colors.mutedForeground}>
        {PRICE_OPTIONS.map(option => <FilterChip key={option.value} label={option.label} selected={priceFilter === option.value} onPress={() => setPriceFilter(option.value)} colors={colors} />)}
      </FilterGroup>
      <FilterGroup label="SPOTS LEFT" color={colors.mutedForeground}>
        {SPOT_OPTIONS.map(option => <FilterChip key={option.value} label={option.label} selected={spotFilter === option.value} onPress={() => setSpotFilter(option.value)} colors={colors} />)}
      </FilterGroup>
      {activeFilterCount || query.trim() ? <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.clearButton}><Feather name="x-circle" size={14} color={colors.primary} /><Text style={[styles.clearText, { color: colors.primary }]}>Clear filters</Text></Pressable> : null}
    </View> : <>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>WHEN</Text>
      <View style={styles.filters}>{(['Any day', 'Today', 'Tomorrow', 'This week'] as DayFilter[]).map(item => <FilterChip key={item} label={item} selected={dayFilter === item} onPress={() => setDayFilter(item)} colors={colors} />)}</View>
      <Text style={[styles.filterLabel, { color: colors.mutedForeground }]}>AREA</Text>
      <View style={styles.filters}>{neighborhoods.map(item => <FilterChip key={item} label={item} selected={areaFilter === item} onPress={() => setAreaFilter(item)} colors={colors} />)}</View>
    </>}

    {!matches.isLoading && !matches.isError ? <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{visible.length} {visible.length === 1 ? 'match' : 'matches'}</Text> : null}
    {matches.isLoading ? <LoadingState /> : matches.isError ? <EmptyState title="Live matches are unavailable" body="You can still open the local sample below. Reconnect the match service to see published games." icon="wifi-off" action="Retry" onAction={() => matches.refetch()} /> : visible.length ? visible.map(match => <MatchCard key={match.id} match={match} recommended={match.ageGroup === recommendedAgeGroup} onPress={() => router.push({ pathname: '/match-registration', params: { id: match.id } })} />) : <EmptyState icon="map-pin" title={hasActiveFilters ? 'No games match those filters.' : 'No matches scheduled yet.'} body={hasActiveFilters ? 'Try widening the date, area, price, or spots left filters.' : 'New games will appear here as soon as they are published.'} action={hasActiveFilters ? 'Clear filters' : undefined} onAction={hasActiveFilters ? clearFilters : undefined} />}
    <SectionTitle kicker="LOCAL PREVIEW" title="Try the sample match" />
    <MatchCard match={sampleMatchListing} onPress={() => router.push('/match-registration')} />
    <Modal transparent visible={pushPromptOpen} animationType="fade" onRequestClose={() => setPushPromptOpen(false)}>
      <View style={styles.pushBackdrop}>
        <View style={[styles.pushCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.pushIcon, { backgroundColor: colors.secondary }]}><Feather name="bell" size={22} color={colors.primary} /></View>
          <Text style={[styles.pushTitle, { color: colors.foreground }]}>Never miss kickoff.</Text>
          <Text style={[styles.pushDescription, { color: colors.mutedForeground }]}>Allow notifications for a heads-up before your match and when new games are ready to join. You can change this anytime.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Allow notifications" accessibilityState={{ busy: matchAlertsBusy }} disabled={matchAlertsBusy} onPress={() => void allowMatchPush()} style={[styles.pushAllow, { backgroundColor: colors.primary, opacity: matchAlertsBusy ? .65 : 1 }]}>
            <Text style={[styles.pushAllowText, { color: colors.primaryForeground }]}>{matchAlertsBusy ? 'Setting up…' : 'Allow notifications'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Not now; keep in-app reminders" disabled={matchAlertsBusy} onPress={() => { setPushPromptOpen(false); setMatchAlertsMessage('In-app alerts are on. Push notifications are optional—you can allow them anytime.'); }} style={styles.pushLater}>
            <Text style={[styles.pushLaterText, { color: colors.mutedForeground }]}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  </Screen>;
}

function FilterGroup({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return <View style={styles.filterGroup}><Text style={[styles.filterLabel, { color }]}>{label}</Text><View style={styles.filters}>{children}</View></View>;
}

function FilterChip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filter, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}>
    <Text style={{ color: selected ? colors.primaryForeground : colors.mutedForeground, fontSize: 11, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 12 },
  title: { fontSize: 31, fontFamily: 'Georgia', marginTop: 8 },
  sub: { fontSize: 13, marginTop: 6, marginBottom: 22 },
  searchBox: { height: 50, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchInput: { flex: 1, fontSize: 13 },
  alertRow: { minHeight: 76, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  alertIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  alertCopy: { flex: 1, gap: 4 },
  alertTitle: { fontSize: 12, fontWeight: '800' },
  alertDescription: { fontSize: 10, lineHeight: 14 },
  alertButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  alertButtonText: { fontSize: 11, fontWeight: '800' },
  alertStatus: { fontSize: 11, lineHeight: 16, marginTop: 6, marginHorizontal: 4 },
  pushBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.72)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  pushCard: { width: '100%', maxWidth: 390, borderWidth: 1, borderRadius: 24, padding: 22, alignItems: 'center' },
  pushIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pushTitle: { fontSize: 24, lineHeight: 30, fontFamily: 'Georgia', fontWeight: '700', textAlign: 'center' },
  pushDescription: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9, marginBottom: 18 },
  pushAllow: { minHeight: 50, width: '100%', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pushAllowText: { fontSize: 13, fontWeight: '800' },
  pushLater: { minHeight: 48, width: '100%', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  pushLaterText: { fontSize: 12, fontWeight: '700' },
  controlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  filterLabel: { fontSize: 9, letterSpacing: 1.4, fontWeight: '700' },
  filterToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderWidth: 1, borderRadius: 13 },
  filterToggleText: { fontSize: 11, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 9, flexWrap: 'wrap' },
  filter: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  filterPanel: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 4, marginBottom: 10 },
  filterGroup: { marginBottom: 9 },
  clearButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', marginTop: 2 },
  clearText: { fontSize: 12, fontWeight: '700' },
  resultCount: { fontSize: 11, fontWeight: '600', marginTop: 4, marginBottom: 8 },
});

