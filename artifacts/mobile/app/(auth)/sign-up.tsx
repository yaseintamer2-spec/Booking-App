import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useSignUp } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, Field, GoogleSignInButton } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp(); const { isSignedIn } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { if (isSignedIn) router.replace('/(auth)/preferred-position'); }, [isSignedIn, router]);
  if (isSignedIn) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const verifyStep = signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address') && signUp.missingFields.length === 0;
  const sendCode = async () => {
    setMessage('');
    try {
      const { error } = await signUp.password({ emailAddress: email.trim(), password });
      if (error) { setMessage(error.message || 'Could not create your account.'); return; }
      await signUp.verifications.sendEmailCode();
    } catch {
      setMessage('Could not send the verification email. Check your connection and try again.');
    }
  };
  const verify = async () => {
    setMessage('');
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) { setMessage(error.message || 'That code was not accepted.'); return; }
      if (signUp.status === 'complete') await signUp.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/(auth)/preferred-position') as never) });
      else setMessage('Your email is verified, but account setup is incomplete. Check the required fields in Auth settings.');
    } catch {
      setMessage('Email verification could not finish. Check the code and try again.');
    }
  };
  const errorsText = errors.fields.emailAddress?.message || errors.fields.password?.message || errors.fields.code?.message;
  return <View style={{ flex: 1, backgroundColor: colors.background }}><BrandHeader back hideMenu />
    <KeyboardAwareScrollViewCompat bottomOffset={72} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>{verifyStep ? 'ONE LAST STEP' : 'MAKE ROOM FOR GAME NIGHT'}</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{verifyStep ? 'Check your inbox.' : 'Join the\nline-up.'}</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>{verifyStep ? `We sent a one-time code to ${email}.` : 'One account per email. No phone number required.'}</Text>
      {verifyStep ? <View style={{ marginTop: 30 }}><Field label="EMAIL VERIFICATION CODE" value={code} onChangeText={setCode} placeholder="Enter the code" keyboardType="numeric" /><Button label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify and continue'} onPress={verify} disabled={!code || fetchStatus === 'fetching'} /><Pressable onPress={async () => { try { await signUp.verifications.sendEmailCode(); setMessage(`A new code was sent to ${email}.`); } catch { setMessage('Could not resend the code. Try again shortly.'); } }} style={styles.resend}><Text style={[styles.resendText, { color: colors.primary }]}>Send me a new code</Text></Pressable></View> :
         <View style={{ marginTop: 28 }}><Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoComplete="email" /><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Your email is your account identity. Keep it unique and yours.</Text><Button label={fetchStatus === 'fetching' ? 'Creating account…' : 'Create account'} onPress={sendCode} disabled={!email || !password || fetchStatus === 'fetching'} icon="arrow-right" /></View>}
      {!verifyStep ? <><View style={styles.divider}><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>OR CONTINUE WITH</Text><View style={[styles.rule, { backgroundColor: colors.border }]} /></View><GoogleSignInButton /></> : null}
      {message || errorsText ? <Text style={[styles.error, { color: colors.destructive }]}>{message || errorsText}</Text> : null}
      <View nativeID="clerk-captcha" />
      <View style={styles.footer}><Text style={[styles.copy, { color: colors.mutedForeground }]}>Already a member? </Text><Link href="/(auth)/sign-in" style={{ color: colors.primary, fontWeight: '700' }}>Sign in</Link></View>
      <View style={[styles.security, { borderColor: colors.border }]}><Feather name="lock" size={14} color={colors.primary} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Your account is secured by Clerk. Email verification happens once during sign-up.</Text></View>
    </KeyboardAwareScrollViewCompat>
  </View>;
}
const styles = StyleSheet.create({ container: { paddingHorizontal: 24, paddingTop: 19 }, eyebrow: { fontSize: 10, letterSpacing: 1.7, fontWeight: '700' }, title: { fontSize: 36, lineHeight: 41, fontFamily: 'Georgia', marginTop: 10 }, copy: { fontSize: 13, lineHeight: 20, marginTop: 9 }, helper: { fontSize: 11, lineHeight: 17, marginBottom: 17 }, error: { fontSize: 12, marginTop: 14 }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 27 }, resend: { alignSelf: 'center', padding: 15 }, resendText: { fontSize: 12, fontWeight: '700' }, security: { borderTopWidth: 1, marginTop: 25, paddingTop: 16, flexDirection: 'row', gap: 10 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 22 }, rule: { height: 1, flex: 1 }, or: { fontSize: 9, letterSpacing: 1.3 } });
