import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ImageBackground, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { isLocalPreviewMode } from '@/lib/localPreview';
import { IconBadge } from '@/components/IconBadge';
import { homeHeroImage } from '@/components/KickoffUI';

type DayFilter = 'Any day' | 'Today' | 'Tomorrow' | 'This week';
type SortOption = 'soonest' | 'most-spots';
type SpotFilter = 0 | 5 | 8;

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Soonest', value: 'soonest' },
  { label: 'Most spots', value: 'most-spots' },
];
const SPOT_OPTIONS: { label: string; value: SpotFilter }[] = [
  { label: 'Any', value: 0 },
  { label: '5 or more spots', value: 5 },
  { label: '8 or more spots', value: 8 },
];

export default function MatchesScreen() {
  const colors = useColors();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('Any day');
  const [sortBy, setSortBy] = useState<SortOption>('soonest');
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
  const listedMatches = matches.data?.length ? matches.data : isLocalPreviewMode ? [sampleMatchListing] : [];
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
    if (isLocalPreviewMode) {
      setMatchAlertsEnabled(false);
      setMatchAlertsLoading(false);
      return;
    }
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
    if (isLocalPreviewMode) {
      const next = !matchAlertsEnabled;
      setMatchAlertsEnabled(next);
      setMatchAlertsMessage(next ? 'Match alerts are on for this preview.' : 'Match alerts are off.');
      return;
    }
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

    return listedMatches.filter(match => {
      const startsAt = new Date(match.startsAt);
      const dateMatches = dayFilter === 'Any day'
        || (dayFilter === 'Today' && startsAt >= today && startsAt < tomorrow)
        || (dayFilter === 'Tomorrow' && startsAt >= tomorrow && startsAt < dayAfter)
        || (dayFilter === 'This week' && startsAt >= today && startsAt < weekEnd);
      const searchMatches = `${match.venueName} ${match.neighborhood} ${match.address}`.toLowerCase().includes(needle);
      const spotsMatch = match.spotsRemaining >= spotFilter;
      return dateMatches && searchMatches && spotsMatch;
    }).sort((a, b) => {
      if (sortBy === 'most-spots') return b.spotsRemaining - a.spotsRemaining || Date.parse(a.startsAt) - Date.parse(b.startsAt);
      return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    });
  }, [listedMatches, query, dayFilter, spotFilter, sortBy]);

  const activeFilterCount = Number(dayFilter !== 'Any day') + Number(spotFilter !== 0);
  const hasActiveFilters = activeFilterCount > 0 || query.trim().length > 0;
  const clearFilters = () => {
    setQuery('');
    setDayFilter('Any day');
    setSpotFilter(0);
    setSortBy('soonest');
  };

  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="FIND YOUR GAME" />
    <ImageBackground source={homeHeroImage} resizeMode="cover" style={styles.discoverHero} imageStyle={styles.discoverHeroImage}>
      <View style={[StyleSheet.absoluteFill, styles.discoverShade]} />
      <View style={styles.discoverHeroTop}><Text style={styles.heroKicker}>KICKOFF / RIYADH</Text><IconBadge name="compass" tone="cyan" size="medium" /></View>
      <View><Text style={styles.discoverTitle}>Find your{ '\n' }next game.</Text><Text style={styles.discoverSub}>Real pitches. Good people. Game on.</Text></View>
    </ImageBackground>
    <Pressable accessibilityRole="button" onPress={() => router.push('/player-age' as never)} style={[styles.ageLink, { backgroundColor: `${colors.violet}20`, borderColor: `${colors.violet}44` }]}><IconBadge name="user" tone="violet" size="small" /><Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.foreground }}>{playerAge == null ? 'Add your age for match recommendations' : `Age ${playerAge} · ${recommendedAgeGroup ? `recommended group ${recommendedAgeGroup.replace('-', '–')}` : 'edit age'}`}</Text><Feather name="arrow-up-right" size={14} color={colors.violet} /></Pressable>

    <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconBadge name="search" tone="cyan" size="small" />
      <TextInput accessibilityLabel="Search matches by venue, area, or address" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Venue, area, or address" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} />
    </View>

    <View style={[styles.alertRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconBadge name="bell" tone="yellow" size="medium" />
      <View style={styles.alertCopy}>
        <Text style={[styles.alertTitle, { color: colors.foreground }]}>New match alerts</Text>
        <Text numberOfLines={2} style={[styles.alertDescription, { color: colors.mutedForeground }]}>{matchAlertsMessage || (matchAlertsEnabled ? 'Get reminders before kickoff and an alert when a new game is posted.' : 'Get reminders before kickoff and an alert when a new game is posted.')}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={matchAlertsEnabled ? 'Turn off new match alerts' : 'Alert me when a new match is available'} accessibilityState={{ disabled: matchAlertsLoading || matchAlertsBusy, selected: matchAlertsEnabled, busy: matchAlertsBusy }} disabled={matchAlertsLoading || matchAlertsBusy} onPress={() => void toggleMatchAlerts()} style={[styles.alertButton, { backgroundColor: matchAlertsEnabled ? colors.secondary : colors.primary, borderColor: matchAlertsEnabled ? colors.border : colors.primary, opacity: matchAlertsLoading || matchAlertsBusy ? 0.6 : 1 }]}>
        <Text style={[styles.alertButtonText, { color: matchAlertsEnabled ? colors.foreground : colors.primaryForeground }]}>{matchAlertsLoading ? 'Loading…' : matchAlertsBusy ? 'Saving…' : matchAlertsEnabled ? 'Alerts on' : 'Alert me'}</Text>
      </Pressable>
    </View>
    {matchAlertsMessage ? <Text accessibilityRole="status" style={[styles.alertStatus, { color: matchAlertsEnabled ? colors.primary : colors.mutedForeground }]}>{matchAlertsMessage}</Text> : null}

    <View style={[styles.filterBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open match filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(true)} style={[styles.filterOpenButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <IconBadge name="sliders" tone="cyan" size="small" /><Text style={[styles.filterOpenText, { color: colors.foreground }]}>Filters</Text>{activeFilterCount > 0 ? <View style={[styles.filterCount, { backgroundColor: colors.pink }]}><Text style={[styles.filterCountText, { color: colors.background }]}>{activeFilterCount}</Text></View> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sort matches by ${sortBy === 'soonest' ? 'soonest' : 'most available spots'}. Tap to change.`} onPress={() => setSortBy(value => value === 'soonest' ? 'most-spots' : 'soonest')} style={[styles.sortButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Feather name="bar-chart-2" size={15} color={colors.violet} /><Text style={[styles.sortButtonText, { color: colors.foreground }]}>{sortBy === 'soonest' ? 'Soonest' : 'Most spots'}</Text><Feather name="chevron-down" size={14} color={colors.mutedForeground} /></Pressable>
    </View>
    {activeFilterCount > 0 || query.trim() ? <View style={styles.activeFilterSummary}><View style={[styles.activeFilterDot, { backgroundColor: colors.primary }]} /><Text style={[styles.activeFilterText, { color: colors.mutedForeground }]}>{[dayFilter !== 'Any day' ? dayFilter : null, spotFilter ? SPOT_OPTIONS.find(option => option.value === spotFilter)?.label : null, query.trim() ? `“${query.trim()}”` : null].filter(Boolean).join(' · ')}</Text><Pressable accessibilityRole="button" accessibilityLabel="Clear search and match filters" onPress={clearFilters} style={styles.clearMini}><Feather name="x" size={14} color={colors.cyan} /></Pressable></View> : null}
    <Modal transparent visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
      <View style={styles.sheetBackdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFiltersOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.filterSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.foreground }]}>Filters</Text><Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>Narrow down your next match</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFiltersOpen(false)} style={[styles.sheetClose, { backgroundColor: colors.secondary }]}><Feather name="x" size={18} color={colors.foreground} /></Pressable></View>
          <Text style={[styles.sheetLabel, { color: colors.mutedForeground }]}>WHEN</Text>
          <View style={styles.sheetOptionGrid}>{(['Any day', 'Today', 'Tomorrow', 'This week'] as DayFilter[]).map(item => <FilterChip key={item} label={item} selected={dayFilter === item} onPress={() => setDayFilter(item)} colors={colors} />)}</View>
          <Text style={[styles.sheetLabel, { color: colors.mutedForeground, marginTop: 18 }]}>MINIMUM AVAILABLE SPOTS</Text>
          <View style={styles.sheetSpotRow}>{SPOT_OPTIONS.map(option => <FilterChip key={option.value} compact label={option.value === 0 ? 'Any' : `${option.value}+ spots`} selected={spotFilter === option.value} onPress={() => setSpotFilter(option.value)} colors={colors} />)}</View>
          <View style={styles.sheetActions}><Pressable accessibilityRole="button" onPress={clearFilters} style={[styles.sheetClearButton, { borderColor: colors.border }]}><Text style={[styles.sheetClearText, { color: colors.mutedForeground }]}>Clear all</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={[styles.sheetApplyButton, { backgroundColor: colors.primary }]}><Text style={[styles.sheetApplyText, { color: colors.primaryForeground }]}>Show {visible.length} {visible.length === 1 ? 'match' : 'matches'}</Text></Pressable></View>
        </View>
      </View>
    </Modal>

    {!matches.isLoading || isLocalPreviewMode ? <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>{visible.length} {visible.length === 1 ? 'match' : 'matches'}</Text> : null}
    {matches.isLoading && !isLocalPreviewMode ? <LoadingState /> : visible.length ? visible.map(match => <MatchCard key={match.id} match={match} recommended={match.ageGroup === recommendedAgeGroup} onPress={() => router.push(match.id === sampleMatchListing.id ? '/match-registration' : { pathname: '/match-registration', params: { id: match.id } })} />) : <EmptyState icon="map-pin" title={hasActiveFilters ? 'No games match those filters.' : 'No matches scheduled yet.'} body={hasActiveFilters ? 'Try widening the time or availability filters.' : 'New games will appear here as soon as they are published.'} action={hasActiveFilters ? 'Clear filters' : undefined} onAction={hasActiveFilters ? clearFilters : undefined} />}
    <Modal transparent visible={pushPromptOpen} animationType="fade" onRequestClose={() => setPushPromptOpen(false)}>
      <View style={styles.pushBackdrop}>
        <View style={[styles.pushCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <IconBadge name="bell" tone="yellow" size="large" />
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

function FilterChip({ label, selected, onPress, colors, compact = false }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.filter, compact && styles.filterCompact, { backgroundColor: selected ? colors.primary : colors.secondary, borderColor: selected ? colors.primary : colors.border }]}>
    {selected ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
    <Text style={{ color: selected ? colors.primaryForeground : colors.foreground, fontSize: 12, fontWeight: '800' }}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  discoverHero: { minHeight: 220, borderRadius: 23, overflow: 'hidden', padding: 17, justifyContent: 'space-between', marginTop: 8 },
  discoverHeroImage: { borderRadius: 23 }, discoverShade: { backgroundColor: 'rgba(18,10,51,.56)' },
  discoverHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroKicker: { color: '#E8E1FF', fontSize: 9, letterSpacing: 1.5, fontWeight: '900' },
  discoverTitle: { color: 'white', fontSize: 32, fontFamily: 'Georgia', lineHeight: 35, fontWeight: '700' }, discoverSub: { color: '#E8E1FF', fontSize: 11, marginTop: 7 },
  ageLink: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 15, marginTop: 10, marginBottom: 15 },
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
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 18, padding: 7, marginTop: 12 },
  filterOpenButton: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  filterOpenText: { fontSize: 12, fontWeight: '800' },
  filterCount: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterCountText: { fontSize: 10, fontWeight: '900' },
  sortButton: { flex: 1, minWidth: 0, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  sortButtonText: { fontSize: 11, fontWeight: '800' },
  activeFilterSummary: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 35, paddingHorizontal: 5 },
  activeFilterDot: { width: 6, height: 6, borderRadius: 3 },
  activeFilterText: { flex: 1, fontSize: 10, fontWeight: '700' },
  clearMini: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,3,20,.58)' },
  filterSheet: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontFamily: 'Georgia', fontWeight: '700' },
  sheetSubtitle: { fontSize: 11, marginTop: 4 },
  sheetClose: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetLabel: { fontSize: 9, letterSpacing: 1.3, fontWeight: '900', marginBottom: 9 },
  sheetOptionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sheetSpotRow: { flexDirection: 'row', gap: 8 },
  filter: { flexBasis: '48%', minHeight: 46, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 7 },
  filterCompact: { flex: 1, flexBasis: 0, paddingHorizontal: 8 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 24 },
  sheetClearButton: { minHeight: 50, minWidth: 100, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  sheetClearText: { fontSize: 12, fontWeight: '800' },
  sheetApplyButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sheetApplyText: { fontSize: 13, fontWeight: '900' },
  clearButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)', marginTop: 2 },
  clearText: { fontSize: 12, fontWeight: '700' },
  resultCount: { fontSize: 11, fontWeight: '600', marginTop: 4, marginBottom: 8 },
});




