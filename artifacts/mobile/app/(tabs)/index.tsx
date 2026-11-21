import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, getListMatchesQueryKey, useGetCurrentUser, useListMatches } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, LoadingState, MatchCard, Screen, SectionTitle } from '@/components/KickoffUI';
import { homeHeroImage } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const matches = useListMatches({ query: { queryKey: getListMatchesQueryKey(), retry: false, staleTime: 20_000 } });
  return <Screen refreshing={matches.isRefetching} onRefresh={() => { void matches.refetch(); }}>
    <BrandHeader user={user.data} subtitle="RIYADH, SA" />
    <View style={styles.greeting}><Text style={[styles.hello, { color: colors.mutedForeground }]}>GOOD EVENING{user.data?.name ? `, ${user.data.name.split(' ')[0].toUpperCase()}` : ''}</Text><Text style={[styles.headline, { color: colors.foreground }]}>Find your{'\n'}next match.</Text></View>
    <ImageBackground source={homeHeroImage} resizeMode="cover" style={styles.featureImage} imageStyle={{ borderRadius: 20 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(4,12,7,0.43)', borderRadius: 20 }]} />
      <View style={[styles.featureTag, { backgroundColor: 'rgba(7,18,13,.8)' }]}><Text style={[styles.tagText, { color: colors.primary }]}>THE KICKOFF STANDARD</Text></View>
      <View style={styles.featureBottom}><View><Text style={[styles.featureTitle, { color: colors.foreground }]}>All game.{'\n'}No group chat.</Text><Text style={[styles.featureCaption, { color: colors.secondaryForeground }]}>7v7, set up and ready to play.</Text></View><Pressable onPress={() => router.push('/(tabs)/matches')} style={[styles.roundArrow, { backgroundColor: colors.primary }]}><Feather name="arrow-up-right" size={19} color={colors.primaryForeground} /></Pressable></View>
    </ImageBackground>
    <SectionTitle kicker="OPEN GAMES" title="On the calendar" action="See all" onAction={() => router.push('/(tabs)/matches')} />
    {matches.isLoading ? <LoadingState /> : matches.isError ? <EmptyState icon="alert-circle" title="Couldn't load matches" body="Your connection may be taking a breather. Try again." action="Retry" onAction={() => matches.refetch()} /> :
      matches.data?.length ? matches.data.slice(0, 2).map(match => <MatchCard key={match.id} match={match} onPress={() => router.push({ pathname: '/match-registration', params: { id: match.id } })} />) :
        <EmptyState icon="sunset" title="A little calm before kickoff." body="There are no published matches right now. Check back soon for organized 7v7 games around Riyadh." />}
    <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.card }]}><Feather name="shield" size={16} color={colors.primary} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Match format, timing, player capacity, and referee and water inclusions are shown before you choose.</Text></View>
  </Screen>;
}
const styles = StyleSheet.create({ greeting: { marginTop: 10, marginBottom: 23 }, hello: { fontSize: 10, letterSpacing: 1.7, fontWeight: '700' }, headline: { fontFamily: 'Georgia', fontSize: 39, lineHeight: 43, marginTop: 9 }, featureImage: { height: 250, padding: 17, justifyContent: 'space-between', overflow: 'hidden' }, featureTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20 }, tagText: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4 }, featureBottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, featureTitle: { fontSize: 29, lineHeight: 33, fontFamily: 'Georgia' }, featureCaption: { fontSize: 12, marginTop: 8 }, roundArrow: { width: 42, height: 42, borderRadius: 15, justifyContent: 'center', alignItems: 'center' }, note: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', gap: 10, marginTop: 5 }, noteText: { flex: 1, fontSize: 11, lineHeight: 17 } });
