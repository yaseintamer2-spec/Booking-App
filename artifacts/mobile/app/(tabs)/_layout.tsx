import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useAuth, useUser } from '@clerk/expo';
import { AccountMenu } from '@/components/AccountMenu';
import { useColors } from '@/hooks/useColors';
import { useAppTheme } from '@/providers/ThemeProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PositionBadge } from '@/components/PreferredPositionPicker';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useRouter } from 'expo-router';

export default function TabsLayout() {
  const colors = useColors();
  const { theme } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [accountMenuVisible, setAccountMenuVisible] = useState(false);
  const [preferredPosition, setPreferredPosition] = useState<string | null>(null);
  const [legalStatus, setLegalStatus] = useState<'checking' | 'accepted' | 'required' | 'error'>('checking');
  const [legalAttempt, setLegalAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const response = await fetchWithTimeout(`${apiBaseUrl}/api/legal/acceptance`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 7_000);
        const result = await response.json();
        if (!response.ok) throw new Error('Could not verify the current terms.');
        if (!active) return;
        if (result.accepted) setLegalStatus('accepted');
        else { setLegalStatus('required'); router.replace('/legal/accept'); }
      } catch { if (active) setLegalStatus('error'); }
    })();
    return () => { active = false; };
  }, [getToken, legalAttempt, router]);
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/preferred-position`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 5_000); const result = await response.json(); if (active && response.ok && typeof result.preferredPosition === 'string') setPreferredPosition(result.preferredPosition); } catch { /* The profile screen can refresh the badge later. */ } })(); return () => { active = false; }; }, [getToken]);
  if (legalStatus !== 'accepted') return <View style={[styles.legalGate, { backgroundColor: colors.background }]}>
    {legalStatus === 'error' ? <><Text style={[styles.legalGateTitle, { color: colors.foreground }]}>Can’t verify your terms yet.</Text><Text style={[styles.legalGateCopy, { color: colors.mutedForeground }]}>Check your connection, then try again.</Text><Pressable accessibilityRole="button" onPress={() => { setLegalStatus('checking'); setLegalAttempt((value) => value + 1); }} style={[styles.legalGateButton, { backgroundColor: colors.primary }]}><Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>Try again</Text></Pressable></> : null}
  </View>;
  return <><Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.mutedForeground,
    tabBarStyle: { position: 'absolute', backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background, borderTopColor: colors.border, borderTopWidth: 1, height: Platform.OS === 'web' ? 84 : 58 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(4, insets.bottom), elevation: 0 },
    tabBarBackground: () => Platform.OS === 'ios' ? <BlurView intensity={72} tint={theme === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />,
    tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  }}>
    <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="matches" options={{ title: 'Discover', tabBarIcon: ({ color }) => <Feather name="search" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="my-matches" options={{ title: 'My matches', tabBarIcon: ({ color }) => <Feather name="calendar" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="rankings" options={{ title: 'Rankings', tabBarIcon: ({ color }) => <Feather name="award" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarButton: (props) => <Pressable accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityState={props.accessibilityState} onPress={() => setAccountMenuVisible(true)} style={props.style}>{props.children}</Pressable>, tabBarIcon: ({ color }) => user?.imageUrl ? <View style={styles.profileAvatarWrap}><Image source={{ uri: user.imageUrl }} accessibilityLabel="Your profile picture" style={{ width: 31, height: 31, borderRadius: 16, borderWidth: 2, borderColor: color, marginTop: -5 }} /><PositionBadge position={preferredPosition} style={styles.profilePositionBadge} /></View> : <Feather name="user" size={19} color={typeof color === 'string' ? color : colors.primary} /> }} />
  </Tabs><AccountMenu visible={accountMenuVisible} onClose={() => setAccountMenuVisible(false)} /></>;
}

const styles = StyleSheet.create({ profileAvatarWrap: { position: 'relative', width: 35, height: 34 }, profilePositionBadge: { position: 'absolute', right: -4, bottom: 0 }, legalGate: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 26 }, legalGateTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' }, legalGateCopy: { fontSize: 13, textAlign: 'center', marginTop: 8 }, legalGateButton: { minHeight: 48, minWidth: 130, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 18 } });

