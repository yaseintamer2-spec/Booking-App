import React from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { IconBadge } from '@/components/IconBadge';
import { cardImage } from '@/components/KickoffUI';

export default function RankingsScreen() {
  const colors = useColors();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  return <Screen><BrandHeader user={user.data} subtitle="RIYADH LEADERBOARD" />
    <ImageBackground source={cardImage} resizeMode="cover" imageStyle={styles.heroImage} style={styles.hero}>
      <View style={styles.heroShade} />
      <View style={styles.heroTop}><Text style={styles.heroKicker}>THE CITY'S BEST</Text><IconBadge name="award" tone="yellow" size="large" /></View>
      <View><Text style={styles.heroTitle}>Earn your{ '\n' }place up top.</Text><Text style={styles.heroCopy}>Every match gives the city another story.</Text></View>
    </ImageBackground>
    <View style={styles.statRow}>{[
      { label: 'GOALS', icon: 'target' as const, tone: 'pink' as const },
      { label: 'FAIR PLAY', icon: 'shield' as const, tone: 'cyan' as const },
      { label: 'WINS', icon: 'trending-up' as const, tone: 'primary' as const },
    ].map(item => <View key={item.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}><IconBadge name={item.icon} tone={item.tone} size="medium" /><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text></View>)}</View>
    <View style={[styles.period, { borderColor: colors.border, backgroundColor: colors.card }]}><IconBadge name="activity" tone="violet" size="medium" /><View style={{ flex: 1 }}><Text style={[styles.periodTitle, { color: colors.foreground }]}>A league worth joining</Text><Text style={[styles.periodCopy, { color: colors.mutedForeground }]}>Rankings will be built from real match activity as the community grows.</Text></View></View>
    <EmptyState icon="award" title="The table is still taking shape." body="Rankings will be based on real match activity. No points or players are made up." />
  </Screen>;
}
const styles = StyleSheet.create({ hero: { minHeight: 246, marginTop: 10, borderRadius: 24, overflow: 'hidden', padding: 17, justifyContent: 'space-between' }, heroImage: { borderRadius: 24 }, heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,10,51,.48)' }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, heroKicker: { color: 'white', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 }, heroTitle: { color: 'white', fontFamily: 'Georgia', fontSize: 31, lineHeight: 34, fontWeight: '700' }, heroCopy: { color: '#E7E2F8', fontSize: 11, marginTop: 8 }, statRow: { flexDirection: 'row', gap: 9, marginTop: 12 }, statCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 11, minHeight: 90, justifyContent: 'space-between' }, statLabel: { fontSize: 8, letterSpacing: 1, fontWeight: '900' }, period: { marginTop: 12, borderWidth: 1, borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, periodTitle: { fontSize: 13, fontWeight: '800' }, periodCopy: { fontSize: 11, lineHeight: 16, marginTop: 4 } });

