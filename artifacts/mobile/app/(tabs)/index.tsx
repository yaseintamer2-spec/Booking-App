import React from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { getGetCurrentUserQueryKey, getListMatchesQueryKey, useGetCurrentUser, useListMatches } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle } from '@/components/KickoffUI';
import { homeHeroImage } from '@/components/KickoffUI';
import { IconBadge } from '@/components/IconBadge';
import { useColors } from '@/hooks/useColors';
import { sampleMatchListing } from '@/data/matchRegistrationMock';
import { isLocalPreviewMode } from '@/lib/localPreview';

const venuePhotos = [
  { title: 'King Fahd District', place: 'North Riyadh', image: require('../../assets/images/riyadh-pitch-hero.jpg') },
  { title: 'The evening pitch', place: 'Olaya', image: require('../../assets/images/home-stadium-sunset.png') },
  { title: 'Under the lights', place: 'Al Malqa', image: require('../../assets/images/football-match-card.jpg') },
];

export default function HomeScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = useListMatches({ query: { queryKey: getListMatchesQueryKey(), retry: false, staleTime: 20_000 } });
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
      <Svg width="100%" height="100%" viewBox="0 0 390 300" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Rect x="204" y="24" width="154" height="252" rx="3" fill="none" stroke="white" strokeOpacity=".28" strokeWidth="1.3" />
        <Line x1="281" y1="24" x2="281" y2="276" stroke="white" strokeOpacity=".28" strokeWidth="1.3" />
        <Circle cx="281" cy="150" r="43" fill="none" stroke="white" strokeOpacity=".28" strokeWidth="1.3" />
        <Circle cx="281" cy="150" r="3" fill="white" fillOpacity=".4" />
      </Svg>
      <View style={styles.heroTop}><View style={styles.heroTag}><View style={[styles.liveDot, { backgroundColor: colors.primary }]} /><Text style={styles.heroTagText}>RIYADH FOOTBALL, SORTED</Text></View><IconBadge name="zap" tone="yellow" size="medium" /></View>
      <View style={styles.heroBottom}><View style={{ flex: 1 }}><Text style={[styles.heroTitle, { color: colors.foreground }]}>Good football.{ '\n' }Good people.</Text><Text style={[styles.heroCopy, { color: '#E7E2F8' }]}>Show up. Play hard. Leave the group chat behind.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Explore available matches" onPress={() => router.push('/(tabs)/matches')} style={[styles.heroButton, { backgroundColor: colors.primary }]}><Feather name="arrow-up-right" size={21} color={colors.primaryForeground} /></Pressable></View>
    </ImageBackground>

    <View style={styles.quickGrid}>{quickActions.map((action) => <Pressable key={action.label} accessibilityRole="button" onPress={() => router.push(action.path as never)} style={({ pressed }) => [styles.quickTile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? .78 : 1 }]}><IconBadge name={action.icon} tone={action.tone} size="medium" /><Text style={[styles.quickTitle, { color: colors.foreground }]}>{action.label}</Text><Text style={[styles.quickCaption, { color: colors.mutedForeground }]}>{action.caption}</Text><Feather name="arrow-up-right" size={15} color={colors[action.tone]} style={styles.quickArrow} /></Pressable>)}</View>

    <SectionTitle kicker="YOUR CITY, YOUR PITCH" title="Where we play" action="Explore" onAction={() => router.push('/(tabs)/matches')} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.venueStrip}>
      {venuePhotos.map((venue, index) => <Pressable key={venue.title} accessibilityRole="button" accessibilityLabel={`Explore matches near ${venue.title}, ${venue.place}`} onPress={() => router.push('/(tabs)/matches')} style={[styles.venueTile, { borderColor: colors.border }]}>
        <Image source={venue.image} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <View style={styles.venueShade} />
        <View style={[styles.venueIndex, { backgroundColor: [colors.primary, colors.pink, colors.orange][index] }]}><Text style={[styles.venueIndexText, { color: colors.background }]}>0{index + 1}</Text></View>
        <View style={styles.venueCopy}><Text style={styles.venueTitle}>{venue.title}</Text><Text style={styles.venuePlace}><Feather name="map-pin" size={11} color={colors.cyan} />  {venue.place}</Text></View>
      </Pressable>)}
    </ScrollView>

    <SectionTitle kicker="OPEN GAMES" title="On the calendar" action="See all" onAction={() => router.push('/(tabs)/matches')} />
    {matches.isLoading && !isLocalPreviewMode ? <LoadingState /> : listedMatches.length ? listedMatches.map(match => <MatchCard key={match.id} match={match} onPress={() => openMatch(match.id)} />) :
        <EmptyState icon="sunset" title="A little calm before kickoff." body="There are no published matches right now. Check back soon for organized 7v7 games around Riyadh." />}
    <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.card }]}><IconBadge name="shield" tone="violet" size="small" /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Match format, timing, player capacity, referee and water inclusions are shown before you choose.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({
  greeting: { marginTop: 10, marginBottom: 20 }, hello: { fontSize: 9, letterSpacing: 1.45, fontWeight: '800' }, headline: { fontFamily: 'Georgia', fontSize: 38, lineHeight: 42, marginTop: 9 },
  hero: { height: 292, padding: 17, justifyContent: 'space-between', overflow: 'hidden', borderRadius: 24 }, heroImage: { borderRadius: 24 }, heroShade: { backgroundColor: 'rgba(18,10,51,.55)' }, heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroTag: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(18,10,51,.76)' }, liveDot: { width: 7, height: 7, borderRadius: 4 }, heroTagText: { color: 'white', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 }, heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 }, heroTitle: { fontFamily: 'Georgia', fontSize: 28, lineHeight: 31, fontWeight: '700' }, heroCopy: { fontSize: 11, lineHeight: 16, marginTop: 8, maxWidth: 240 }, heroButton: { width: 48, height: 48, borderRadius: 17, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  quickGrid: { flexDirection: 'row', gap: 9, marginTop: 13 }, quickTile: { flex: 1, minHeight: 126, borderWidth: 1, borderRadius: 18, padding: 10, justifyContent: 'flex-start' }, quickTitle: { fontSize: 12, fontWeight: '800', marginTop: 10 }, quickCaption: { fontSize: 9, lineHeight: 13, marginTop: 3 }, quickArrow: { position: 'absolute', top: 13, right: 10 },
  venueStrip: { gap: 10, paddingBottom: 2 }, venueTile: { width: 220, height: 146, borderRadius: 19, overflow: 'hidden', borderWidth: 1, justifyContent: 'space-between', padding: 12 }, venueShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,10,51,.30)' }, venueIndex: { width: 31, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, venueIndexText: { fontSize: 9, fontWeight: '900' }, venueCopy: { gap: 5 }, venueTitle: { color: 'white', fontSize: 16, fontWeight: '800' }, venuePlace: { color: '#E7E2F8', fontSize: 10, fontWeight: '700' },
  note: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, marginBottom: 12 }, noteText: { flex: 1, fontSize: 10, lineHeight: 16 },
});

