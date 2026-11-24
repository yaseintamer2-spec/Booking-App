import React, { useEffect, useState } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useSignIn } from '@clerk/expo';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, Field, GoogleSignInButton, heroImage } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn(); const { isSignedIn } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (isSignedIn) router.replace('/(auth)/preferred-position'); }, [isSignedIn, router]);
  if (isSignedIn) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const busy = fetchStatus === 'fetching';
  const submit = async () => {
    setMessage('');
    try {
      const { error } = await signIn.password({ emailAddress: email.trim(), password });
      if (error) { setMessage(error.message || 'Those details did not match. Try again.'); return; }
      if (signIn.status === 'complete') {
        await signIn.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(auth)/preferred-position') as never) });
      } else {
        setMessage('This account requires an extra sign-in check. KICKOFF uses password sign-in without email codes; try Google or contact support.');
      }
    } catch {
      setMessage('Sign-in could not finish. Check your connection and try again.');
    }
  };
  const errorField = errors.fields.identifier?.message || errors.fields.password?.message;
  return <ImageBackground source={heroImage} resizeMode="cover" style={styles.background}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]} />
    <BrandHeader title="KICKOFF" back backFallback="/(auth)/welcome" hideMenu />
    <KeyboardAwareScrollViewCompat bottomOffset={72} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Sign in to KICKOFF</Text><Text style={[styles.copy, { color: colors.mutedForeground }]}>Find matches and manage your bookings.</Text>
      <View style={{ marginTop: 28 }}><Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoComplete="email" /><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoComplete="current-password" /></View>
      {errorField || message ? <Text style={[styles.error, { color: colors.destructive }]}>{message || errorField}</Text> : null}
      <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={!email || !password || busy} icon="arrow-right" />
      <View style={styles.divider}><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>OR CONTINUE WITH</Text><View style={[styles.rule, { backgroundColor: colors.border }]} /></View>
      <GoogleSignInButton />
      <View style={styles.footer}><Text style={[styles.copy, { color: colors.mutedForeground }]}>New to KICKOFF? </Text><Link href="/(auth)/sign-up" style={{ color: colors.primary, fontWeight: '700' }}>Create account</Link></View>
    </KeyboardAwareScrollViewCompat>
  </ImageBackground>;
}
const styles = StyleSheet.create({ background: { flex: 1, width: '100%', height: '100%' }, backdrop: { backgroundColor: 'rgba(5,17,26,0.74)' }, container: { paddingHorizontal: 24, paddingTop: 19 }, title: { fontSize: 30, lineHeight: 37, fontWeight: '800' }, copy: { fontSize: 14, lineHeight: 21, marginTop: 7 }, error: { fontSize: 13, lineHeight: 19, marginBottom: 12 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 22 }, rule: { height: 1, flex: 1 }, or: { fontSize: 11, letterSpacing: .4 }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 } });
