import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useAuth, useUser } from '@clerk/expo';
import { AccountMenu } from '@/components/AccountMenu';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PositionBadge } from '@/components/PreferredPositionPicker';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { clearLocalAcceptance, hasCurrentLocalAcceptance } from '@/lib/legalAcceptance';
import { LEGAL_PRIVACY_VERSION, LEGAL_TERMS_VERSION } from '@/data/legalDocuments';
import { useRouter } from 'expo-router';
import { isLocalPreviewMode } from '@/lib/localPreview';

export default function TabsLayout() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { getToken, userId } = useAuth();
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [preferredPosition, setPreferredPosition] = useState<string | null>(null);
  const [legalStatus, setLegalStatus] = useState<'checking' | 'accepted' | 'required'>('checking');
  useEffect(() => {
    let active = true;
    (async () => {
      if (isLocalPreviewMode) { setLegalStatus('accepted'); return; }
      const locallyAccepted = userId ? await hasCurrentLocalAcceptance(userId) : false;
      if (active && locallyAccepted) setLegalStatus('accepted');
      try {
        const token = await getToken();
        const response = await fetchWithTimeout(`${apiBaseUrl}/api/legal/acceptance`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 7_000);
        const result = await response.json();
        if (!response.ok) throw new Error('Could not verify the current terms.');
        if (!active) return;
        if (result.accepted) setLegalStatus('accepted');
        else if (locallyAccepted && userId) {
          setLegalStatus('accepted');
          const sync = await fetchWithTimeout(`${apiBaseUrl}/api/legal/acceptance`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ termsVersion: LEGAL_TERMS_VERSION, privacyVersion: LEGAL_PRIVACY_VERSION }),
          }, 7_000);
          if (sync.ok) await clearLocalAcceptance(userId);
        } else { setLegalStatus('required'); router.replace('/legal/accept'); }
      } catch {
        if (active && !locallyAccepted) { setLegalStatus('required'); router.replace('/legal/accept'); }
      }
    })();
    return () => { active = false; };
  }, [getToken, router, userId]);
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/preferred-position`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 5_000); const result = await response.json(); if (active && response.ok && typeof result.preferredPosition === 'string') setPreferredPosition(result.preferredPosition); } catch { /* The profile screen can refresh the badge later. */ } })(); return () => { active = false; }; }, [getToken]);
  if (legalStatus !== 'accepted') return <View style={[styles.legalGate, { backgroundColor: colors.background }]}>
    {legalStatus === 'required' ? <><Text style={[styles.legalGateTitle, { color: colors.foreground }]}>One quick step before you play.</Text><Text style={[styles.legalGateCopy, { color: colors.mutedForeground }]}>Review and accept the current Terms and Privacy Notice to continue.</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/legal/accept')} style={[styles.legalGateButton, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Review and continue</Text></Pressable></> : null}
  </View>;
  return <><Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarStyle: { position: 'absolute', backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.card, borderTopColor: colors.border, borderTopWidth: 1, height: Platform.OS === 'web' ? 76 : 60 + insets.bottom, paddingTop: 7, paddingBottom: Math.max(4, insets.bottom), elevation: 0, shadowColor: '#20392C', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10 },
    tabBarBackground: () => Platform.OS === 'ios' ? <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />,
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ focused }) => <Feather name="home" size={19} color={focused ? colors.primary : colors.mutedForeground} /> }} />
    <Tabs.Screen name="matches" options={{ title: 'Discover', tabBarIcon: ({ focused }) => <Feather name="search" size={19} color={focused ? colors.primary : colors.mutedForeground} /> }} />
    <Tabs.Screen name="my-matches" options={{ title: 'My matches', tabBarIcon: ({ focused }) => <Feather name="calendar" size={19} color={focused ? colors.primary : colors.mutedForeground} /> }} />
    <Tabs.Screen name="rankings" options={{ title: 'Rankings', tabBarIcon: ({ focused }) => <Feather name="award" size={19} color={focused ? colors.primary : colors.mutedForeground} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarButton: (props) => <Pressable accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityState={props.accessibilityState} onPress={() => setAccountMenuVisible(true)} style={props.style}>{props.children}</Pressable>, tabBarIcon: ({ focused }) => user?.imageUrl ? <View style={styles.profileAvatarWrap}><Image source={{ uri: user.imageUrl }} accessibilityLabel="Your profile picture" style={{ width: 27, height: 27, borderRadius: 14, borderWidth: 1.5, borderColor: focused ? colors.primary : colors.border, marginTop: -2 }} /><PositionBadge position={preferredPosition} style={styles.profilePositionBadge} /></View> : <Feather name="user" size={19} color={focused ? colors.primary : colors.mutedForeground} /> }} />
  </Tabs><AccountMenu visible={accountMenuVisible} onClose={() => setAccountMenuVisible(false)} /></>;
}

const styles = StyleSheet.create({ profileAvatarWrap: { position: 'relative', width: 35, height: 34 }, profilePositionBadge: { position: 'absolute', right: -4, bottom: 0 }, legalGate: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26 }, legalGateTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' }, legalGateCopy: { fontSize: 13, textAlign: 'center', marginTop: 8 }, legalGateButton: { minHeight: 48, minWidth: 130, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 18 } });


