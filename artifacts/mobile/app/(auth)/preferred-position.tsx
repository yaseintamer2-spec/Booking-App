import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { BrandHeader, Button, Screen } from '@/components/KickoffUI';
import { PreferredPositionPicker, type PlayerPosition, isPlayerPosition } from '@/components/PreferredPositionPicker';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useColors } from '@/hooks/useColors';

export default function PreferredPositionScreen() {
  const colors = useColors(); const router = useRouter(); const { getToken, userId } = useAuth();
  const [selected, setSelected] = useState<PlayerPosition>('striker');
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState(''); const [savedOffline, setSavedOffline] = useState(false);
  const preferenceKey = userId ? `kickoff:preferred-position:${userId}` : null;
  const load = useCallback(async () => {
    setError(''); setSyncMessage('');
    const cached = preferenceKey ? await AsyncStorage.getItem(preferenceKey).catch(() => null) : null;
    if (isPlayerPosition(cached)) setSelected(cached);
    try {
      const token = await getToken();
      const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/preferred-position`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, 5_000);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your profile position.');
      if (isPlayerPosition(result.preferredPosition)) {
        setSelected(result.preferredPosition);
        if (preferenceKey) await AsyncStorage.removeItem(preferenceKey);
        router.replace('/(tabs)'); return;
      }
      if (isPlayerPosition(cached)) {
        const saveResponse = await fetchWithTimeout(`${apiBaseUrl}/api/me/preferred-position`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ preferredPosition: cached }),
        }, 5_000);
        if (!saveResponse.ok) throw new Error('Could not sync your saved position yet.');
        await AsyncStorage.removeItem(preferenceKey!);
        router.replace('/(tabs)'); return;
      }
    } catch {
      if (isPlayerPosition(cached)) setSelected(cached);
      setSyncMessage('Your account service is unavailable right now. You can still choose a position and save it on this device.');
    }
  }, [getToken, preferenceKey, router]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (saving) return;
    setSaving(true); setError(''); setSyncMessage(''); setSavedOffline(false);
    try {
      if (!preferenceKey) throw new Error('Your account is still loading. Try again in a moment.');
      await AsyncStorage.setItem(preferenceKey, selected);
    } catch {
      setError('Could not save your position on this device. Please try again.');
      setSaving(false);
      return;
    }
    try {
      const token = await getToken();
      const response = await fetchWithTimeout(`${apiBaseUrl}/api/me/preferred-position`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ preferredPosition: selected }),
      }, 6_000);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your position.');
      if (preferenceKey) await AsyncStorage.removeItem(preferenceKey);
      router.replace('/(tabs)');
    } catch {
      setSavedOffline(true);
      setSyncMessage('Saved on this device. We’ll sync it to your player profile when your connection is back.');
    }
    finally { setSaving(false); }
  };

  return <Screen>
    <BrandHeader title="KICKOFF" hideMenu />
    <View style={styles.heroIcon}><Feather name="award" size={24} color={colors.primary} /></View>
    <Text style={[styles.kicker, { color: colors.primary }]}>YOUR PLAYER CARD</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Where do you play?</Text>
    <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Choose your favorite position. It adds a small badge to your profile photo so other players can get to know your style.</Text>
    <View style={[styles.note, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="info" size={15} color={colors.primary} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>Just for your profile. It will not affect match registration, team selection, or balancing.</Text></View>
    {syncMessage ? <View accessibilityRole="status" style={[styles.syncNotice, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name={savedOffline ? 'check-circle' : 'wifi-off'} size={15} color={colors.primary} /><Text style={[styles.noteText, { color: colors.mutedForeground }]}>{syncMessage}</Text></View> : null}
    <>
      <PreferredPositionPicker selected={selected} onSelect={setSelected} />
      {error ? <View style={styles.errorRow}><Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}><Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text></Pressable></View> : null}
      {savedOffline ? <Button label="Continue to KICKOFF" onPress={() => router.replace('/(tabs)')} icon="arrow-right" /> : <Button label={saving ? 'Saving your profile…' : 'Save my position'} onPress={() => void save()} disabled={saving} icon="arrow-right" />}
    </>
  </Screen>;
}

const styles = StyleSheet.create({
  heroIcon: { width: 54, height: 54, borderRadius: 18, marginTop: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(57,217,138,.12)' },
  kicker: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginTop: 18 },
  title: { fontFamily: 'Georgia', fontSize: 31, lineHeight: 37, marginTop: 7 },
  subtitle: { fontSize: 12, lineHeight: 19, marginTop: 8, marginBottom: 16 },
  note: { borderWidth: 1, borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 },
  syncNotice: { borderWidth: 1, borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
  noteText: { flex: 1, fontSize: 10, lineHeight: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
  error: { flex: 1, fontSize: 11, lineHeight: 16 },
  retry: { minHeight: 44, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 11, fontWeight: '800' },
});
