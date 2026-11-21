import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { BrandHeader, Button, Field, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { apiBaseUrl } from '@/lib/apiBaseUrl';

export default function PlayerAgeScreen() {
  const colors = useColors(); const { getToken } = useAuth(); const [age, setAge] = useState(''); const [guardian, setGuardian] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { let active = true; void (async () => { try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/age`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active && response.ok && result.age) setAge(String(result.age)); } catch { /* Users can still enter their age manually. */ } })(); return () => { active = false; }; }, [getToken]);
  const ageValue = age.trim() ? Number(age) : Number.NaN; const needsGuardian = Number.isInteger(ageValue) && ageValue < 18;
  const save = async () => { setBusy(true); setError(''); try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/age`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ age: ageValue, guardianAcknowledged: guardian }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save your age.'); setSaved(true); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your age.'); } finally { setBusy(false); } };
  return <Screen><BrandHeader back subtitle="PLAYER PROFILE"/><Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 18 }}>MATCH PREFERENCES</Text><Text style={{ color: colors.foreground, fontSize: 31, fontFamily: 'Georgia', marginTop: 7 }}>Your age group.</Text><Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 20 }}>Enter your age to highlight the most suitable match group. This is self-reported and does not prevent booking. Referees check age at the venue and can refuse entry if you do not meet the match group, even if you have paid.</Text>
    <Field label="AGE (NOT DATE OF BIRTH)" value={age} onChangeText={value => { setAge(value.replace(/\D/g, '').slice(0, 3)); setSaved(false); }} placeholder="e.g. 16" keyboardType="numeric" />
    {needsGuardian ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: guardian }} onPress={() => setGuardian(value => !value)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 }}><Feather name={guardian ? 'check-square' : 'square'} size={20} color={guardian ? colors.primary : colors.mutedForeground}/><Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>My parent or legal guardian has given permission for me to use KICKOFF.</Text></Pressable> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12, marginBottom: 12 }}>{error}</Text> : null}{saved ? <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 12, marginBottom: 12 }}>Age preference saved.</Text> : null}<Button label={busy ? 'Saving…' : 'Save age'} onPress={() => void save()} disabled={busy || !age} />
  </Screen>;
}
