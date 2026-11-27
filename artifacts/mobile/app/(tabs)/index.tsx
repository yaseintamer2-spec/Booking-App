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
});



