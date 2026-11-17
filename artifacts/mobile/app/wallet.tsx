import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function WalletScreen() {
  const colors = useColors(); const router = useRouter();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  useEffect(() => { if (user.error) router.replace('/(auth)/welcome'); }, [user.error, router]);
  return <Screen><BrandHeader back user={user.data} subtitle="YOUR WALLET" /><Text style={[styles.kicker, { color: colors.primary }]}>KICKOFF WALLET</Text><Text style={[styles.title, { color: colors.foreground }]}>Wallet.</Text>
    <View style={[styles.balance, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.balanceTop}><Text style={[styles.label, { color: colors.mutedForeground }]}>AVAILABLE BALANCE</Text><Feather name="credit-card" size={16} color={colors.primary} /></View><Text style={[styles.amount, { color: colors.foreground }]}>— <Text style={[styles.currency, { color: colors.mutedForeground }]}>SAR</Text></Text><Text style={[styles.note, { color: colors.mutedForeground }]}>Wallet balance will appear when wallet services are available.</Text></View>
    <EmptyState icon="layers" title="No wallet activity." body="Match payments and wallet transactions are not enabled yet. Your payment details stay private and are never collected on this screen." />
  </Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 }, title: { fontSize: 36, fontFamily: 'Georgia', marginTop: 8 }, balance: { borderWidth: 1, borderRadius: 19, padding: 20, marginTop: 20 }, balanceTop: { flexDirection: 'row', justifyContent: 'space-between' }, label: { fontSize: 9, letterSpacing: 1.2, fontWeight: '700' }, amount: { fontSize: 38, fontWeight: '700', marginTop: 19 }, currency: { fontSize: 13 }, note: { fontSize: 11, marginTop: 9, lineHeight: 17 } });
