import React, { useEffect, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle, formatRiyadhDate, formatRiyadhTime } from '@/components/KickoffUI';
import { homeHeroImage } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useColors } from '@/hooks/useColors';
import { sampleMatchListing } from '@/data/matchRegistrationMock';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { usePublicMatches } from '@/hooks/usePublicMatches';

type HomeRegistration = {
  status: 'joined' | 'offered' | 'waitlisted' | 'checked_in';
  match: { id: string; venueName: string; neighborhood: string; startsAt: string; liveStatus: string };
};

export default function HomeScreen() {
  const colors = useColors(); const router = useRouter();
  const { getToken, isSignedIn } = useAuth();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = usePublicMatches();
  const [nextMatch, setNextMatch] = useState<HomeRegistration['match'] | null>(null);
  const [nextMatchError, setNextMatchError] = useState('');
  useEffect(() => {
    let active = true;
    if (isLocalPreviewMode || !isSignedIn) {
      setNextMatch(null);
      setNextMatchError('');
      return () => { active = false; };
    }
    void (async () => {
      const token = await getToken();
      const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/registrations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }, 8_000);
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Could not load your upcoming match.';
        throw new Error(message);
      }
      if (!Array.isArray(payload)) throw new Error('The API returned an invalid registrations response.');
      const upcoming = (payload as HomeRegistration[])
        .filter((registration) => registration.status !== 'waitlisted')
        .map((registration) => registration.match)
        .filter((match) => !!match?.id && match.liveStatus !== 'full_time' && Date.parse(match.startsAt) > Date.now())
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      if (active) {
        setNextMatch(upcoming[0] ?? null);
        setNextMatchError('');
      }
    })().catch((error: unknown) => {
      if (active) setNextMatchError(error instanceof Error ? error.message : 'Could not load your upcoming match.');
    });
    return () => { active = false; };
  }, [getToken, isSignedIn]);
  const publicMatches = matches.data?.filter((match) => match.id !== nextMatch?.id) ?? [];
  const listedMatches = publicMatches.length ? publicMatches.slice(0, 2) : isLocalPreviewMode ? [sampleMatchListing] : [];
  const firstName = user.data?.name.trim().split(/\s+/)[0];
  const openMatch = (id: string) => router.push(id === sampleMatchListing.id ? '/match-registration' : { pathname: '/match-registration', params: { id } });
  const quickActions = [
    { label: 'Find a match', caption: 'Browse open games', icon: 'search' as const, tone: 'primary' as const, path: '/(tabs)/matches' },
    { label: 'My matches', caption: 'Your upcoming games', icon: 'calendar' as const, tone: 'cyan' as const, path: '/(tabs)/my-matches' },
    { label: 'Wallet', caption: 'Payment details', icon: 'credit-card' as const, tone: 'violet' as const, path: '/wallet' },
  ];
  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="RIYADH, SA" />
    <View style={styles.intro}>
      <Text style={[styles.introKicker, { color: colors.primary }]}>YOUR CITY, YOUR GAME</Text>
      <Text style={[styles.introTitle, { color: colors.foreground }]}>{firstName ? `Good to see you, ${firstName}.` : 'Ready for your next match?'}</Text>
    </View>
    <ImageBackground source={homeHeroImage} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
      <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
      <View style={styles.heroTop}><View style={styles.heroTag}><Feather name="map-pin" size={13} color="#FFFFFF" /><Text style={styles.heroTagText}>RIYADH · 7V7</Text></View><Feather name="activity" size={20} color="#FFFFFF" /></View>
      <View style={styles.heroBottom}><View style={{ flex: 1 }}><Text style={styles.heroTitle}>Your next game starts here.</Text><Text style={styles.heroCopy}>Find a pitch, pick your spot, and get ready to play.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Browse available matches" onPress={() => router.push('/(tabs)/matches')} style={[styles.heroButton, { backgroundColor: colors.primary }]}><Text style={styles.heroButtonText}>Explore</Text><Feather name="arrow-right" size={16} color="#FFFFFF" /></Pressable></View>
    </ImageBackground>

    <View style={styles.quickGrid}>{quickActions.map((action) => <Pressable key={action.label} accessibilityRole="button" onPress={() => router.push(action.path as never)} style={({ pressed }) => [styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .78 : 1 }]}><View style={[styles.quickIcon, { backgroundColor: `${colors[action.tone]}14` }]}><Feather name={action.icon} size={18} color={colors[action.tone]} /></View><Text style={[styles.quickTitle, { color: colors.foreground }]}>{action.label}</Text><Text style={[styles.quickCaption, { color: colors.mutedForeground }]}>{action.caption}</Text></Pressable>)}</View>

    {nextMatchError ? <Text accessibilityRole="alert" style={[styles.nextMatchError, { color: colors.destructive }]}>{nextMatchError}</Text> : null}
    {nextMatch ? <Pressable accessibilityRole="button" accessibilityLabel={`Open your next match at ${nextMatch.venueName}`} onPress={() => router.push({ pathname: '/match-registration', params: { id: nextMatch.id } })} style={({ pressed }) => [styles.nextMatchCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .78 : 1 }]}><View style={[styles.nextMatchIcon, { backgroundColor: `${colors.primary}18` }]}><Feather name="calendar" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.nextMatchKicker, { color: colors.primary }]}>YOUR NEXT MATCH</Text><Text style={[styles.nextMatchTitle, { color: colors.foreground }]}>{nextMatch.venueName}</Text><Text style={[styles.nextMatchMeta, { color: colors.mutedForeground }]}>{nextMatch.neighborhood} · {formatRiyadhDate(nextMatch.startsAt)} · {formatRiyadhTime(nextMatch.startsAt)}</Text></View><Feather name="chevron-right" size={18} color={colors.primary} /></Pressable> : null}

    <SectionTitle kicker="PICK UP WHERE YOU LEFT OFF" title="Upcoming matches" action="See all" onAction={() => router.push('/(tabs)/matches')} />
    {matches.isLoading && !isLocalPreviewMode ? <LoadingState /> : listedMatches.length ? listedMatches.map(match => <MatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />) :
        <EmptyState icon="calendar" title="No matches are listed yet." body="Published 7v7 games will appear here with the pitch, time, and available places." />}
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { marginTop: 2, marginBottom: 15, gap: 5 },
  introKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  introTitle: { fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -.4 },
  hero: { height: 250, padding: 19, justifyContent: 'space-between', overflow: 'hidden', borderRadius: 22 },
  heroImage: { borderRadius: 22 },
  heroShade: { backgroundColor: 'rgba(8,27,19,.58)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTag: { minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.16)' },
  heroTagText: { color: 'white', fontSize: 10, fontWeight: '800', letterSpacing: .8 },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: '800', maxWidth: 310 },
  heroCopy: { color: '#EAF2ED', fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 300 },
  heroButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginBottom: 2 },
  heroButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quickAction: { flex: 1, minWidth: 0, minHeight: 114, borderWidth: 1, borderRadius: 17, padding: 12, justifyContent: 'center', gap: 7 },
  quickIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  quickTitle: { fontSize: 13, fontWeight: '800' },
  quickCaption: { fontSize: 11, lineHeight: 15 },
  nextMatchCard: { minHeight: 82, borderWidth: 1, borderRadius: 17, padding: 13, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextMatchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextMatchKicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  nextMatchTitle: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  nextMatchMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  nextMatchError: { marginTop: 14, fontSize: 12 },
});



