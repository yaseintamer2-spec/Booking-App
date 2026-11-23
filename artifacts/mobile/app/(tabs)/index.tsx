import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle } from '@/components/KickoffUI';
import { homeHeroImage } from '@/components/KickoffUI';
import { IconBadge } from '@/components/IconBadge';
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
    { label: 'Find a match', caption: 'Pick your next game', icon: 'search' as const, tone: 'primary' as const, path: '/(tabs)/matches' },
    { label: 'My games', caption: 'Your upcoming kicks', icon: 'calendar' as const, tone: 'pink' as const, path: '/(tabs)/my-matches' },
    { label: 'Wallet', caption: 'Balance & activity', icon: 'credit-card' as const, tone: 'cyan' as const, path: '/wallet' },
  ];
  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="RIYADH, SA" />
    <View style={styles.greeting}><Text style={[styles.hello, { color: colors.cyan }]}>GOOD EVENING{user.data?.name ? `, ${user.data.name.split(' ')[0].toUpperCase()}` : ''}  ·  READY TO PLAY?</Text><Text style={[styles.headline, { color: colors.foreground }]}>Your next game{ '\n' }starts here.</Text></View>
    <ImageBackground source={homeHeroImage} resizeMode="cover" style={styles.hero} imageStyle={styles.heroImage}>
      <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
      <View style={styles.heroTop}><Text style={styles.heroTagText}>RIYADH · 7V7</Text></View>
      <View style={styles.heroBottom}><View style={{ flex: 1 }}><Text style={[styles.heroTitle, { color: colors.foreground }]}>Good football.{ '\n' }Good people.</Text><Text style={[styles.heroCopy, { color: '#E7E2F8' }]}>Show up. Play hard. Leave the group chat behind.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Explore available matches" onPress={() => router.push('/(tabs)/matches')} style={[styles.heroButton, { backgroundColor: colors.primary }]}><Feather name="arrow-up-right" size={21} color={colors.primaryForeground} /></Pressable></View>
    </ImageBackground>

    <View style={styles.quickGrid}>{quickActions.map((action) => <Pressable key={action.label} accessibilityRole="button" onPress={() => router.push(action.path as never)} style={({ pressed }) => [styles.quickTile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .78 : 1 }]}><IconBadge name={action.icon} tone={action.tone} size="medium" /><Text style={[styles.quickTitle, { color: colors.foreground }]}>{action.label}</Text><Text style={[styles.quickCaption, { color: colors.mutedForeground }]}>{action.caption}</Text><Feather name="arrow-up-right" size={15} color={colors[action.tone]} style={styles.quickArrow} /></Pressable>)}</View>

    <SectionTitle kicker="OPEN GAMES" title="On the calendar" action="See all" onAction={() => router.push('/(tabs)/matches')} />
    {matches.isLoading && !isLocalPreviewMode ? <LoadingState /> : listedMatches.length ? listedMatches.map(match => <MatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />) :
        <EmptyState icon="sunset" title="A little calm before kickoff." body="There are no published matches right now. Check back soon for organized 7v7 games around Riyadh." />}
    <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.card }]}><IconBadge name="shield" tone="violet" size="small" /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Match format, timing, player capacity, referee and water inclusions are shown before you choose.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({
  greeting: { marginTop: 10, marginBottom: 20 }, hello: { fontSize: 9, letterSpacing: 1.45, fontWeight: '800' }, headline: { fontFamily: 'Georgia', fontSize: 38, lineHeight: 42, marginTop: 9 },
  hero: { height: 292, padding: 17, justifyContent: 'space-between', overflow: 'hidden', borderRadius: 24 }, heroImage: { borderRadius: 24 }, heroShade: { backgroundColor: 'rgba(18,10,51,.55)' }, heroTop: { minHeight: 24, alignItems: 'flex-start', justifyContent: 'center' }, heroTagText: { color: 'white', fontSize: 10, fontWeight: '900', letterSpacing: 1.25, textShadowColor: 'rgba(0,0,0,.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 }, heroTitle: { fontFamily: 'Georgia', fontSize: 28, lineHeight: 31, fontWeight: '700' }, heroCopy: { fontSize: 11, lineHeight: 16, marginTop: 8, maxWidth: 240 }, heroButton: { width: 48, height: 48, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  quickGrid: { flexDirection: 'row', gap: 9, marginTop: 13 }, quickTile: { flex: 1, minHeight: 126, borderWidth: 1, borderRadius: 18, padding: 10, justifyContent: 'flex-start' }, quickTitle: { fontSize: 12, fontWeight: '800', marginTop: 10 }, quickCaption: { fontSize: 9, lineHeight: 13, marginTop: 3 }, quickArrow: { position: 'absolute', top: 13, right: 10 },
  note: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, marginBottom: 12 }, noteText: { flex: 1, fontSize: 10, lineHeight: 16 },
});



