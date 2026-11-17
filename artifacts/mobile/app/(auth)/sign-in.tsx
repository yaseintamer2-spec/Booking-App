import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useSignIn, useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, Field } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();
function useWarmUpBrowser() { useEffect(() => { if (Platform.OS !== 'android') return; void WebBrowser.warmUpAsync(); return () => { void WebBrowser.coolDownAsync(); }; }, []); }

export default function SignInScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn(); const { isSignedIn } = useAuth(); const { startSSOFlow } = useSSO(); useWarmUpBrowser();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (isSignedIn) router.replace('/(tabs)'); }, [isSignedIn, router]);
  if (isSignedIn) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const busy = fetchStatus === 'fetching';
  const submit = async () => { setMessage(''); const { error } = await signIn.password({ emailAddress: email.trim(), password }); if (error) { setMessage(error.message || 'Those details did not match. Try again.'); return; }
    if (signIn.status === 'complete') await signIn.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(tabs)') as never) });
    else if (signIn.status === 'needs_client_trust') { const factor = signIn.supportedSecondFactors.find((f) => f.strategy === 'email_code'); if (factor) { await signIn.mfa.sendEmailCode(); setMessage('A verification code is on its way to your email.'); } }
    else setMessage('Your sign-in needs another step. Contact support if this continues.');
  };
  const verify = async () => { await signIn.mfa.verifyEmailCode({ code }); if (signIn.status === 'complete') await signIn.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(tabs)') as never) }); else setMessage('That code could not be verified. Check it and try again.'); };
  const google = useCallback(async () => { try { const { createdSessionId, setActive } = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri({ scheme: 'kickoff' }) }); if (createdSessionId) await setActive!({ session: createdSessionId, navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(tabs)') as never) }); else setMessage('Google sign-in needs additional account details.'); } catch { setMessage('Google sign-in could not start. Please try again.'); } }, [router, startSSOFlow]);
  const errorField = errors.fields.identifier?.message || errors.fields.password?.message || errors.fields.code?.message;
  return <View style={{ flex: 1, backgroundColor: colors.background }}><BrandHeader title="KICKOFF" back />
    <KeyboardAwareScrollViewCompat bottomOffset={72} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>GOOD TO HAVE YOU BACK</Text><Text style={[styles.title, { color: colors.foreground }]}>Pick up where{'\n'}you left off.</Text><Text style={[styles.copy, { color: colors.mutedForeground }]}>Sign in to find your next match in Riyadh.</Text>
      <View style={{ marginTop: 28 }}><Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" /><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry /></View>
      {errorField || message ? <Text style={[styles.error, { color: colors.destructive }]}>{message || errorField}</Text> : null}
      <Button label={busy ? 'Signing in…' : 'Sign in'} onPress={submit} disabled={!email || !password || busy} icon="arrow-right" />
      {signIn.status === 'needs_client_trust' ? <View style={{ marginTop: 15 }}><Field label="EMAIL VERIFICATION CODE" value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="numeric" /><Button label="Verify email" onPress={verify} disabled={!code || busy} /></View> : null}
      <View style={styles.divider}><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>OR CONTINUE WITH</Text><View style={[styles.rule, { backgroundColor: colors.border }]} /></View>
      <Pressable onPress={google} style={[styles.google, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.googleG, { color: colors.foreground }]}>G</Text><Text style={[styles.googleText, { color: colors.foreground }]}>Continue with Google</Text><Feather name="arrow-up-right" size={16} color={colors.mutedForeground} /></Pressable>
      <View style={styles.footer}><Text style={[styles.copy, { color: colors.mutedForeground }]}>New to KICKOFF? </Text><Link href="/(auth)/sign-up" style={{ color: colors.primary, fontWeight: '700' }}>Create account</Link></View>
    </KeyboardAwareScrollViewCompat>
  </View>;
}
const styles = StyleSheet.create({ container: { paddingHorizontal: 24, paddingTop: 19 }, eyebrow: { fontSize: 10, letterSpacing: 1.7, fontWeight: '700' }, title: { fontSize: 35, lineHeight: 40, fontFamily: 'Georgia', marginTop: 10 }, copy: { fontSize: 13, lineHeight: 20, marginTop: 9 }, error: { fontSize: 12, lineHeight: 18, marginBottom: 12 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 22 }, rule: { height: 1, flex: 1 }, or: { fontSize: 9, letterSpacing: 1.3 }, google: { height: 52, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, googleG: { fontSize: 17, fontWeight: '800' }, googleText: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600' }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 25 } });
