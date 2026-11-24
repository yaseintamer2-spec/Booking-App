import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle } from '@/components/KickoffUI';
import { homeHeroImage } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { sampleMatchListing } from '@/data/matchRegistrationMock';
import { isLocalPreviewMode } from '@/lib/localPreview';
import { usePublicMatches } from '@/hooks/usePublicMatches';

export default function HomeScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = usePublicMatches();
  const listedMatches = matches.data?.length ? matches.data.slice(0, 2) : isLocalPreviewMode ? [sampleMatchListing] : [];
  const openMatch = (id: string) => router.push(id === sampleMatchListing.id ? '/match-registration' : { pathname: '/match-registration', params: { id } });
  const quickActions = [
    { label: 'Find a match', icon: 'search' as const, tone: 'primary' as const, path: '/(tabs)/matches' },
    { label: 'My matches', icon: 'calendar' as const, tone: 'pink' as const, path: '/(tabs)/my-matches' },
    { label: 'Wallet', icon: 'credit-card' as const, tone: 'cyan' as const, path: '/wallet' },
  ];
  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="RIYADH, SA" />
    <ImageBackground source={homeHeroImage} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
      <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
      <View style={styles.heroTop}><Text style={styles.heroTagText}>RIYADH · 7V7</Text></View>
      <View style={styles.heroBottom}><View style={{ flex: 1 }}><Text style={[styles.heroTitle, { color: colors.foreground }]}>Find your next match.</Text><Text style={[styles.heroCopy, { color: '#E7E2F8' }]}>Check the pitch, kickoff time, and open spots before you book.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Browse available matches" onPress={() => router.push('/(tabs)/matches')} style={[styles.heroButton, { backgroundColor: colors.primary }]}><Feather name="arrow-up-right" size={21} color={colors.primaryForeground} /></Pressable></View>
    </ImageBackground>

    <View style={[styles.quickList, { backgroundColor: colors.card, borderColor: colors.border }]}>{quickActions.map((action, index) => <Pressable key={action.label} accessibilityRole="button" onPress={() => router.push(action.path as never)} style={({ pressed }) => [styles.quickAction, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, { opacity: pressed ? .68 : 1 }]}><Feather name={action.icon} size={18} color={colors[action.tone]} /><Text style={[styles.quickTitle, { color: colors.foreground }]}>{action.label}</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>)}</View>

    <SectionTitle title="Upcoming matches" action="See all" onAction={() => router.push('/(tabs)/matches')} />
    {matches.isLoading && !isLocalPreviewMode ? <LoadingState /> : listedMatches.length ? listedMatches.map(match => <MatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />) :
        <EmptyState icon="calendar" title="No matches are listed yet." body="Published 7v7 games will appear here with the pitch, time, and available places." />}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { height: 250, padding: 17, justifyContent: 'space-between', overflow: 'hidden', borderRadius: 20 }, heroImage: { borderRadius: 20 }, heroShade: { backgroundColor: 'rgba(18,10,51,.54)' }, heroTop: { minHeight: 24, alignItems: 'flex-start', justifyContent: 'center' }, heroTagText: { color: 'white', fontSize: 11, fontWeight: '800', letterSpacing: .8, textShadowColor: 'rgba(0,0,0,.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 }, heroTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800' }, heroCopy: { fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 260 }, heroButton: { width: 48, height: 48, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  quickList: { borderWidth: 1, borderRadius: 16, marginTop: 12, overflow: 'hidden' }, quickAction: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, quickTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
});



