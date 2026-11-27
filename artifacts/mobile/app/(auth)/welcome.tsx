import React from 'react';
import { ImageBackground, Platform, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { heroImage } from '@/components/KickoffUI';
import { Button } from '@/components/KickoffUI';
import { GoogleSignInButton } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect href="/(tabs)" />;
  return <ImageBackground source={heroImage} resizeMode="cover" style={styles.background}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,13,10,0.46)' }]} />
    <View style={[styles.content, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 32 : 0) + 18, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 24 : 0) + 24 }]}>
      <View style={styles.topline}><View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="activity" size={18} color={colors.primaryForeground} /></View><Text style={styles.wordmark}>KICKOFF</Text><View style={styles.cityBadge}><Feather name="map-pin" size={11} color="#FFFFFF" /><Text style={styles.city}>RIYADH, SA</Text></View></View>
      <View style={styles.hero}><Text style={styles.eyebrow}>THE CITY IS YOUR PITCH</Text><Text style={styles.title}>Find your people.{'\n'}Play your game.</Text><Text style={styles.body}>Book a well-organized 7v7 match in Riyadh. Real pitches, clear details, no guesswork.</Text></View>
      <View style={{ gap: 10 }}>
        <GoogleSignInButton />
        <Text style={styles.emailDivider}>OR CONTINUE WITH EMAIL</Text>
        <Button label="Create your account" onPress={() => router.push('/(auth)/sign-up')} icon="arrow-up-right" />
        <Button label="I already have an account" onPress={() => router.push('/(auth)/sign-in')} secondary />
        <Text style={styles.legal}>Secure sign-in · Verified players · Riyadh matches</Text>
      </View>
    </View>
  </ImageBackground>;
}

const styles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'flex-end' },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 24, justifyContent: 'space-between' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  wordmark: { color: '#FFFFFF', fontSize: 14, letterSpacing: 2.1, fontWeight: '800' },
  cityBadge: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto', paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.14)' },
  city: { color: '#FFFFFF', fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  hero: { marginTop: 'auto', marginBottom: 34, maxWidth: 450 },
  eyebrow: { color: '#A8E3C0', fontSize: 10, fontWeight: '800', letterSpacing: 1.7, marginBottom: 11 },
  title: { color: '#FFFFFF', fontSize: 38, lineHeight: 44, fontWeight: '900', letterSpacing: -.7 },
  body: { color: '#EDF2EF', fontSize: 14, lineHeight: 22, maxWidth: 370, marginTop: 12 },
  legal: { color: '#E2E9E4', textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 4 },
  emailDivider: { color: '#E2E9E4', textAlign: 'center', fontSize: 10, letterSpacing: 1, fontWeight: '800', marginTop: 4, marginBottom: 1 },
});
