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
    <View style={[styles.content, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) + 18, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 24 }]}>
      <View style={styles.topline}><View style={[styles.mark, { backgroundColor: colors.primary }]}><Feather name="activity" size={18} color={colors.primaryForeground} /></View><Text style={[styles.wordmark, { color: colors.foreground }]}>KICKOFF</Text><Text style={[styles.city, { color: colors.foreground }]}>RIYADH</Text></View>
      <View style={styles.hero}><Text style={[styles.title, { color: colors.foreground }]}>7v7 football,{ '\n' }ready to book.</Text><Text style={[styles.body, { color: colors.foreground }]}>Find a Riyadh pitch, check the kickoff time and open spots, then join a match.</Text></View>
      <View style={{ gap: 10 }}>
        <GoogleSignInButton />
        <Text style={[styles.emailDivider, { color: colors.foreground }]}>OR CONTINUE WITH EMAIL</Text>
        <Button label="Create your account" onPress={() => router.push('/(auth)/sign-up')} icon="arrow-up-right" />
        <Button label="I already have an account" onPress={() => router.push('/(auth)/sign-in')} secondary />
        <Text style={[styles.legal, { color: colors.foreground }]}>Email verification keeps every player real.</Text>
      </View>
    </View>
  </ImageBackground>;
}

const styles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'flex-end' },
  content: { flex: 1, paddingHorizontal: 25, justifyContent: 'space-between' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  wordmark: { fontSize: 14, letterSpacing: 2.4, fontWeight: '800' },
  city: { fontSize: 9, letterSpacing: 1.8, marginLeft: 'auto', opacity: 0.75 },
  hero: { marginTop: 'auto', marginBottom: 42, maxWidth: 430 },
  title: { fontSize: 40, lineHeight: 46, fontWeight: '900', letterSpacing: -.6 },
  body: { fontSize: 15, lineHeight: 23, maxWidth: 340, marginTop: 12, opacity: 0.92 },
  legal: { textAlign: 'center', fontSize: 12, lineHeight: 17, opacity: 0.86, marginTop: 4 },
  emailDivider: { textAlign: 'center', fontSize: 11, letterSpacing: .4, fontWeight: '700', marginTop: 4, marginBottom: 1, opacity: 0.86 },
});
