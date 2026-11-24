import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function WalletScreen() {
  const colors = useColors();
  const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });

  return <Screen>
    <BrandHeader back user={user.data} subtitle="WALLET" />
    <View style={styles.heading}>
      <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Match receipts and refunds will be kept here.</Text>
    </View>

    <LinearGradient colors={[colors.card, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletCard}>
      <View style={styles.cardTop}>
        <View style={styles.brandLockup}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><Feather name="activity" size={16} color={colors.primaryForeground} /></View><View><Text style={styles.brand}>KICKOFF</Text><Text style={styles.cardCaption}>MATCH WALLET</Text></View></View>
        <View style={[styles.previewBadge, { borderColor: `${colors.yellow}66`, backgroundColor: `${colors.yellow}18` }]}><Text style={[styles.previewBadgeText, { color: colors.yellow }]}>PREVIEW</Text></View>
      </View>
      <View style={styles.cardMessage}>
        <Text style={styles.cardTitle}>Payments aren’t connected yet.</Text>
        <Text style={styles.cardBody}>No card details are collected here. This page will show your match receipts and refunds when checkout is available.</Text>
      </View>
      <View style={[styles.cardRule, { backgroundColor: `${colors.primary}88` }]} />
    </LinearGradient>

    <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/matches')} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? .8 : 1 }]}>
      <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Browse matches</Text>
      <Feather name="arrow-up-right" size={17} color={colors.primaryForeground} />
    </Pressable>

    <View style={styles.activityHeading}><Text style={[styles.activityTitle, { color: colors.foreground }]}>Activity</Text></View>
    <EmptyState icon="file-text" title="No wallet activity." body="Match payments, receipts, and refunds will appear here once checkout is connected." />
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { marginTop: 8, marginBottom: 17 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  walletCard: { minHeight: 218, borderRadius: 20, padding: 19, justifyContent: 'space-between', overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { height: 34, width: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#F7F4FF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  cardCaption: { color: '#D7D0F5', fontSize: 10, fontWeight: '700', letterSpacing: .5, marginTop: 3 },
  previewBadge: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 10, borderWidth: 1 },
  previewBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: .4 },
  cardMessage: { maxWidth: 350, marginVertical: 18 },
  cardTitle: { color: '#F7F4FF', fontSize: 20, lineHeight: 26, fontWeight: '800' },
  cardBody: { color: '#E0DBF1', fontSize: 13, lineHeight: 19, marginTop: 7 },
  cardRule: { height: 3, width: 54, borderRadius: 2 },
  action: { minHeight: 50, borderRadius: 14, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  actionText: { fontSize: 14, fontWeight: '800' },
  activityHeading: { marginTop: 24, marginBottom: 7 },
  activityTitle: { fontSize: 18, fontWeight: '800' },
});
