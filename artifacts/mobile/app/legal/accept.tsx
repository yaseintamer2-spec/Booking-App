import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { BrandHeader, Button, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { storeLocalAcceptance, clearLocalAcceptance } from '@/lib/legalAcceptance';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@/data/legalDocuments';

export default function LegalAcceptanceScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken, userId } = useAuth();
  const { consent } = useLocalSearchParams<{ consent?: string }>();
  const [checked, setChecked] = useState(consent === '1');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    if (!checked || busy) return;
    setBusy(true); setError('');
    try {
      const token = await getToken();
      if (!userId) throw new Error('Your account is still loading. Please try again.');
      let response: Response;
      try {
        response = await fetchWithTimeout(`${apiBaseUrl}/api/legal/acceptance`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ termsVersion: LEGAL_TERMS_VERSION, privacyVersion: LEGAL_PRIVACY_VERSION }) }, 7_000);
      } catch {
        await storeLocalAcceptance(userId);
        router.replace('/(auth)/preferred-position');
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status < 500) throw new Error(result.error || 'Could not save your agreement.');
      if (response.ok) await clearLocalAcceptance(userId);
      else await storeLocalAcceptance(userId);
      router.replace('/(auth)/preferred-position');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your agreement. Check your connection and try again.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (consent === '1') void save(); }, [consent]);
  return <Screen>
    <BrandHeader title="KICKOFF" hideMenu />
    <View style={[styles.icon, { backgroundColor: colors.secondary }]}><Feather name="shield" size={23} color={colors.primary} /></View>
    <Text style={[styles.eyebrow, { color: colors.primary }]}>BEFORE YOU CONTINUE</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>A quick look at the ground rules.</Text>
    <Text style={[styles.copy, { color: colors.mutedForeground }]}>Please review the current terms and privacy notice. We’ll save the versions you accept with your account.</Text>
    <LegalLink label="Terms of Service" path="terms" />
    <LegalLink label="Privacy Notice" path="privacy" />
    <LegalLink label="Cancellations & Refunds" path="refunds" />
    <LegalLink label="Community Standards" path="community" />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setChecked((value) => !value)} style={[styles.checkRow, { borderColor: checked ? colors.primary : colors.border, backgroundColor: colors.card }]}>
      <View style={[styles.checkBox, { borderColor: checked ? colors.primary : colors.mutedForeground, backgroundColor: checked ? colors.primary : 'transparent' }]}>{checked ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}</View>
      <Text style={[styles.checkText, { color: colors.foreground }]}>I agree to the Terms of Service and acknowledge that I have read the Privacy Notice.</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    <Button label={busy ? 'Saving…' : 'Agree and continue'} onPress={() => void save()} disabled={!checked || busy} icon="arrow-right" />
  </Screen>;
  function LegalLink({ label, path }: { label: string; path: string }) {
    return <Pressable accessibilityRole="link" onPress={() => router.push(`/legal/${path}` as never)} style={[styles.link, { borderBottomColor: colors.border }]}><Text style={[styles.linkText, { color: colors.foreground }]}>{label}</Text><Feather name="arrow-up-right" size={15} color={colors.primary} /></Pressable>;
  }
}

const styles = StyleSheet.create({
  icon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 23 },
  eyebrow: { fontSize: 12, letterSpacing: 0.5, fontWeight: '800', marginTop: 18 },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', marginTop: 8 },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 9, marginBottom: 15 },
  link: { minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  linkText: { fontSize: 13, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 19, marginBottom: 14 },
  checkBox: { width: 21, height: 21, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontSize: 13, lineHeight: 19 },
  error: { fontSize: 12, marginBottom: 10 },
});
