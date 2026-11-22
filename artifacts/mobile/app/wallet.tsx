import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { IconBadge } from '@/components/IconBadge';

export default function WalletScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const explainSetup = () => Alert.alert('Wallet is getting ready', 'Payments are not connected yet. You will not be asked for card details here. When secure checkout is available, your payment methods, receipts, and refunds will appear in this wallet.');

  return <Screen>
    <BrandHeader back user={user.data} subtitle="YOUR WALLET" />
    <View style={styles.pageTitleRow}><View><Text style={[styles.kicker, { color: colors.cyan }]}>KICKOFF PAY</Text><Text style={[styles.title, { color: colors.foreground }]}>Your wallet.</Text></View><IconBadge name="credit-card" tone="pink" size="large" /></View>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Match payments, receipts, and refunds together in one place.</Text>

    <LinearGradient colors={['#29145B', '#27205F', '#145C68']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletCard}>
      <View style={styles.glowOne} /><View style={styles.glowTwo} />
      <View style={styles.cardTop}>
        <View style={styles.brandLockup}><IconBadge name="activity" tone="primary" size="medium" /><View><Text style={styles.brand}>KICKOFF</Text><Text style={styles.cardEyebrow}>DIGITAL WALLET</Text></View></View>
        <View style={[styles.previewBadge, { borderColor: `${colors.yellow}66`, backgroundColor: `${colors.yellow}20` }]}><Text style={[styles.previewBadgeText, { color: colors.yellow }]}>PREVIEW</Text></View>
      </View>
      <View style={styles.cardBalance}>
        <Text style={styles.cardLabel}>AVAILABLE BALANCE</Text>
        <View style={styles.amountRow}><Text style={styles.amount}>—</Text><Text style={styles.currency}>SAR</Text></View>
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.chip}><View style={styles.chipLine} /><View style={styles.chipLine} /><View style={styles.chipVertical} /></View>
        <View style={styles.cardFootCopy}><Text style={styles.cardFootTitle}>WALLET PREVIEW</Text><Text style={styles.cardFootSub}>Secure payments are being set up</Text></View>
        <IconBadge name="shield" tone="cyan" size="small" />
      </View>
    </LinearGradient>

    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={explainSetup} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, opacity: pressed ? .78 : 1 }]}>
        <IconBadge name="plus" tone="primary" size="small" /><Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>Add a payment method</Text><Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/my-matches')} style={({ pressed }) => [styles.secondaryAction, { borderColor: colors.border, opacity: pressed ? .72 : 1 }]}>
        <IconBadge name="calendar" tone="cyan" size="small" /><Text style={[styles.secondaryActionText, { color: colors.foreground }]}>My matches</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} />
      </Pressable>
    </View>

    <View style={styles.sectionHeading}><View><Text style={[styles.sectionKicker, { color: colors.pink }]}>WHAT’S NEXT</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Made for match day</Text></View><IconBadge name="lock" tone="violet" size="small" /></View>
    <View style={[styles.featuresCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {[ 
        { icon: 'zap' as const, tone: 'yellow' as const, title: 'Quick match checkout', copy: 'Book and pay securely once a provider is connected.' },
        { icon: 'file-text' as const, tone: 'cyan' as const, title: 'Receipts in one place', copy: 'Keep match charges and receipts together.' },
        { icon: 'rotate-ccw' as const, tone: 'pink' as const, title: 'Refund tracking', copy: 'See refund updates from your wallet timeline.' },
      ].map((feature, index) => <View key={feature.title} style={[styles.featureRow, index < 2 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null]}>
        <IconBadge name={feature.icon} tone={feature.tone} size="medium" />
        <View style={styles.featureCopy}><Text style={[styles.methodTitle, { color: colors.foreground }]}>{feature.title}</Text><Text style={[styles.methodBody, { color: colors.mutedForeground }]}>{feature.copy}</Text></View>
        <Text style={[styles.comingSoon, { color: colors.mutedForeground }]}>SOON</Text>
      </View>)}
    </View>

    <View style={styles.sectionHeading}><View><Text style={[styles.sectionKicker, { color: colors.primary }]}>ACTIVITY</Text><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your wallet timeline</Text></View></View>
    <View style={[styles.activityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconBadge name="clock" tone="orange" size="medium" />
      <View style={{ flex: 1 }}><Text style={[styles.methodTitle, { color: colors.foreground }]}>No wallet activity yet</Text><Text style={[styles.methodBody, { color: colors.mutedForeground }]}>When checkout is live, match payments, refunds, and receipts will appear here.</Text></View>
    </View>

    <Pressable accessibilityRole="button" onPress={explainSetup} style={styles.securityNote}>
      <IconBadge name="shield" tone="primary" size="small" /><Text style={[styles.securityText, { color: colors.mutedForeground }]}>No card details are collected here. Secure payment setup will be handled through a payment provider.</Text><IconBadge name="info" tone="violet" size="small" />
    </Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  kicker: { fontSize: 9, letterSpacing: 1.7, fontWeight: '900', marginTop: 0 },
  title: { fontSize: 32, fontFamily: 'Georgia', marginTop: 6 },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 18 },
  walletCard: { minHeight: 230, borderRadius: 25, padding: 20, overflow: 'hidden', justifyContent: 'space-between', shadowColor: '#07031C', shadowOffset: { width: 0, height: 14 }, shadowOpacity: .35, shadowRadius: 20, elevation: 8 },
  glowOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -65, top: -110, backgroundColor: 'rgba(255,79,168,0.20)' },
  glowTwo: { position: 'absolute', width: 185, height: 185, borderRadius: 93, right: -65, bottom: -116, backgroundColor: 'rgba(53,216,255,0.18)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { height: 31, width: 31, borderRadius: 11, backgroundColor: '#B8F3D0', alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#F3FFF7', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  cardEyebrow: { color: 'rgba(239,255,245,0.72)', fontSize: 7, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  previewBadge: { paddingHorizontal: 9, minHeight: 24, justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(233,255,240,0.16)', borderColor: 'rgba(233,255,240,0.28)', borderWidth: 1 },
  previewBadgeText: { color: '#F3FFF7', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  cardBalance: { marginTop: 14 },
  cardLabel: { color: 'rgba(239,255,245,0.74)', fontSize: 8, letterSpacing: 1.2, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 5 },
  amount: { color: '#F3FFF7', fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -.8 },
  currency: { color: 'rgba(239,255,245,0.77)', fontSize: 11, fontWeight: '800', letterSpacing: .8 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 14 },
  chip: { width: 33, height: 25, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(231,255,240,0.7)', backgroundColor: 'rgba(217,255,230,0.18)', overflow: 'hidden', justifyContent: 'center', gap: 6 },
  chipLine: { height: 1, backgroundColor: 'rgba(231,255,240,0.62)' },
  chipVertical: { position: 'absolute', left: 15, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(231,255,240,0.62)' },
  cardFootCopy: { flex: 1 },
  cardFootTitle: { color: '#F3FFF7', fontSize: 8, letterSpacing: .8, fontWeight: '900' },
  cardFootSub: { color: 'rgba(239,255,245,0.74)', fontSize: 8, marginTop: 3 },
  actions: { gap: 9, marginTop: 13 },
  primaryAction: { minHeight: 50, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryActionText: { flex: 1, fontSize: 12, fontWeight: '900' },
  secondaryAction: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  secondaryActionText: { flex: 1, fontSize: 11, fontWeight: '800' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 11 },
  sectionKicker: { fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  featuresCard: { borderWidth: 1, borderRadius: 21, paddingHorizontal: 13 },
  featureRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  featureIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  featureCopy: { flex: 1 },
  comingSoon: { fontSize: 7, fontWeight: '900', letterSpacing: .5 },
  methodTitle: { fontSize: 11, fontWeight: '800' },
  methodBody: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, minHeight: 25, borderRadius: 20, marginTop: 11 },
  statusDot: { height: 6, width: 6, borderRadius: 3 },
  statusText: { fontSize: 7, fontWeight: '900', letterSpacing: .8 },
  activityCard: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  activityIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  securityNote: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13, paddingHorizontal: 3 },
  securityText: { flex: 1, fontSize: 9, lineHeight: 14 },
});

