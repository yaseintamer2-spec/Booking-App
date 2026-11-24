import React, { useEffect, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth, useSignUp } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BrandHeader, Button, Field, GoogleSignInButton, heroImage } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp(); const { isSignedIn } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [message, setMessage] = useState('');
  const [legalConsent, setLegalConsent] = useState(false);
  useEffect(() => { if (isSignedIn) router.replace(legalConsent ? '/legal/accept?consent=1' as never : '/(auth)/preferred-position'); }, [isSignedIn, legalConsent, router]);
  if (isSignedIn) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  const verifyStep = signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address') && signUp.missingFields.length === 0;
  const sendCode = async () => {
    if (!legalConsent) { setMessage('Please review and accept the Terms and Privacy Notice to continue.'); return; }
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
      if (signUp.status === 'complete') await signUp.finalize({ navigate: ({ decorateUrl }) => router.replace(decorateUrl('/legal/accept?consent=1') as never) });
      else setMessage('Your email is verified, but account setup is incomplete. Check the required fields in Auth settings.');
    } catch {
      setMessage('Email verification could not finish. Check the code and try again.');
    }
  };
  const errorsText = errors.fields.emailAddress?.message || errors.fields.password?.message || errors.fields.code?.message;
  return <ImageBackground source={heroImage} resizeMode="cover" style={styles.background}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]} />
    <BrandHeader back backFallback="/(auth)/welcome" hideMenu />
    <KeyboardAwareScrollViewCompat bottomOffset={72} contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 28 }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>{verifyStep ? 'Verify your email' : 'Create your account'}</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>{verifyStep ? `Enter the code sent to ${email}.` : 'Use your email to join matches and keep your tickets together.'}</Text>
      {verifyStep ? <View style={{ marginTop: 30 }}><Field label="EMAIL VERIFICATION CODE" value={code} onChangeText={setCode} placeholder="Enter the code" keyboardType="numeric" /><Button label={fetchStatus === 'fetching' ? 'Verifying…' : 'Verify and continue'} onPress={verify} disabled={!code || fetchStatus === 'fetching'} /><Pressable onPress={async () => { try { await signUp.verifications.sendEmailCode(); setMessage(`A new code was sent to ${email}.`); } catch { setMessage('Could not resend the code. Try again shortly.'); } }} style={styles.resend}><Text style={[styles.resendText, { color: colors.primary }]}>Send me a new code</Text></Pressable></View> :
         <View style={{ marginTop: 28 }}><Field label="EMAIL ADDRESS" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoComplete="email" /><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Your email is your account identity. Keep it unique and yours.</Text><LegalConsentRow checked={legalConsent} onPress={() => setLegalConsent(!legalConsent)} colors={colors} router={router} /><Button label={fetchStatus === 'fetching' ? 'Creating account…' : 'Create account'} onPress={sendCode} disabled={!legalConsent || !email || !password || fetchStatus === 'fetching'} icon="arrow-right" /></View>}
      {!verifyStep ? <><View style={styles.divider}><View style={[styles.rule, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>OR CONTINUE WITH</Text><View style={[styles.rule, { backgroundColor: colors.border }]} /></View><GoogleSignInButton disabled={!legalConsent} legalConsent={legalConsent} />{!legalConsent ? <Text style={[styles.legalHint, { color: colors.mutedForeground }]}>Review and accept the terms above to continue with Google.</Text> : null}</> : null}
      {message || errorsText ? <Text style={[styles.error, { color: colors.destructive }]}>{message || errorsText}</Text> : null}
      <View nativeID="clerk-captcha" />
      <View style={styles.footer}><Text style={[styles.copy, { color: colors.mutedForeground }]}>Already a member? </Text><Link href="/(auth)/sign-in" style={{ color: colors.primary, fontWeight: '700' }}>Sign in</Link></View>
      <View style={[styles.security, { borderColor: colors.border }]}><Feather name="lock" size={14} color={colors.primary} /><Text style={[styles.helper, { color: colors.mutedForeground }]}>Your account is secured by Clerk. Email verification happens once during sign-up.</Text></View>
    </KeyboardAwareScrollViewCompat>
  </ImageBackground>;
}
function LegalConsentRow({ checked, onPress, colors, router }: { checked: boolean; onPress: () => void; colors: ReturnType<typeof useColors>; router: ReturnType<typeof useRouter> }) {
  return <View style={styles.legalRow}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={[styles.legalCheck, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>{checked ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}</Pressable>
    <Text style={[styles.legalText, { color: colors.mutedForeground }]}>I agree to the <Text onPress={() => router.push('/legal/terms' as never)} style={{ color: colors.primary, fontWeight: '700' }}>Terms</Text> and acknowledge the <Text onPress={() => router.push('/legal/privacy' as never)} style={{ color: colors.primary, fontWeight: '700' }}>Privacy Notice</Text>.</Text>
  </View>;
}

const styles = StyleSheet.create({ background: { flex: 1, width: '100%', height: '100%' }, backdrop: { backgroundColor: 'rgba(5,17,26,0.74)' }, container: { paddingHorizontal: 24, paddingTop: 19 }, title: { fontSize: 30, lineHeight: 37, fontWeight: '800' }, copy: { fontSize: 14, lineHeight: 21, marginTop: 7 }, helper: { fontSize: 13, lineHeight: 19, marginBottom: 17 }, error: { fontSize: 13, lineHeight: 19, marginTop: 14 }, footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 27 }, resend: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, resendText: { fontSize: 13, fontWeight: '700' }, security: { borderTopWidth: 1, marginTop: 25, paddingTop: 16, flexDirection: 'row', gap: 10 }, divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 22 }, rule: { height: 1, flex: 1 }, or: { fontSize: 11, letterSpacing: .4 }, legalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 15 }, legalCheck: { width: 24, height: 24, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, legalText: { flex: 1, fontSize: 13, lineHeight: 19 }, legalHint: { textAlign: 'center', fontSize: 12, lineHeight: 17, marginTop: 8 } });
