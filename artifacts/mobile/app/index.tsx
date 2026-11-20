import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, BrandHeader, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import {
  DEVICE_LOCATION_CACHE_KEY,
  LOCATION_SKIPPED_KEY,
  saveCurrentDeviceLocation,
  skipDeviceLocation,
} from '@/lib/deviceLocation';

type LocationGateState = 'checking' | 'required' | 'denied' | 'ready' | 'unavailable';

export default function EntryRoute() {
  const [locationState, setLocationState] = useState<LocationGateState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const colors = useColors();

  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(LOCATION_SKIPPED_KEY),
      AsyncStorage.getItem(DEVICE_LOCATION_CACHE_KEY),
    ]).then(([skipped, cachedLocation]) => {
      if (active) setLocationState(skipped || cachedLocation ? 'ready' : 'required');
    }).catch(() => {
      if (active) {
        setMessage('We could not load your location preference. You can continue without location.');
        setLocationState('required');
      }
    });
    return () => { active = false; };
  }, []);

  const requestLocation = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setLocationState(permission.canAskAgain ? 'required' : 'denied'); return; }
      await saveCurrentDeviceLocation();
      setLocationState('ready');
    } catch {
      setMessage('We could not read your location. You can continue without it and enable it later in Account settings.');
      setLocationState('unavailable');
    } finally { setBusy(false); }
  };

  const continueWithoutLocation = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await skipDeviceLocation();
      setLocationState('ready');
    } catch (error) {
      console.error('Failed to save the location preference:', error);
      setMessage('Could not save your choice. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (locationState === 'ready') return <EntryDestination />;
  if (locationState === 'checking') return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return <Screen style={styles.gate}>
    <BrandHeader subtitle="WELCOME TO KICKOFF" />
    <View style={[styles.locationIcon, { backgroundColor: colors.accent }]}><Feather name="map-pin" size={27} color={colors.primary} /></View>
    <Text style={[styles.kicker, { color: colors.primary }]}>OPTIONAL FOR NEARBY GAMES</Text>
    <Text style={[styles.title, { color: colors.foreground }]}>Find games{ '\n' }close to you.</Text>
    <Text style={[styles.body, { color: colors.mutedForeground }]}>Location helps find nearby games, but it is optional. Your coordinates stay on this device and are not sent to KICKOFF servers or other players. You can enable it later in Account settings.</Text>
    {message ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>{message}</Text> : null}
    <Button label={busy ? 'Getting your location…' : locationState === 'denied' ? 'Open location settings' : 'Share location & continue'} onPress={() => locationState === 'denied' ? void Linking.openSettings() : void requestLocation()} disabled={busy} icon={locationState === 'denied' ? 'settings' : 'map-pin'} />
    <Pressable accessibilityRole="button" onPress={() => void continueWithoutLocation()} disabled={busy} style={styles.skip}>
      <Text style={[styles.skipText, { color: colors.primary }]}>{busy ? 'Please wait…' : 'Continue without location'}</Text>
    </Pressable>
    {locationState === 'unavailable' ? <Pressable accessibilityRole="button" onPress={() => void requestLocation()} style={styles.retry}><Text style={[styles.retryText, { color: colors.mutedForeground }]}>Try again</Text></Pressable> : null}
    <View style={styles.permissionNote}><Feather name="bell" size={15} color={colors.mutedForeground} /><Text style={[styles.permissionCopy, { color: colors.mutedForeground }]}>Push notifications are optional. You can turn them on later from My Matches.</Text></View>
  </Screen>;
}

function EntryDestination() {
  const colors = useColors();
  if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return <Redirect href="/match-registration" />;
  return <AuthenticatedEntryRoute colors={colors} />;
}

function AuthenticatedEntryRoute({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <Redirect href={isSignedIn ? '/(tabs)' : '/(auth)/welcome'} />;
}

const styles = StyleSheet.create({
  gate: { justifyContent: 'center' },
  locationIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.6, marginTop: 27 },
  title: { fontSize: 36, lineHeight: 40, fontFamily: 'Georgia', marginTop: 10 },
  body: { fontSize: 13, lineHeight: 21, marginTop: 14, marginBottom: 22, maxWidth: 340 },
  message: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  retry: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  retryText: { fontSize: 12, fontWeight: '700' },
  skip: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, fontWeight: '700' },
  permissionNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 22, maxWidth: 340 },
  permissionCopy: { flex: 1, fontSize: 10, lineHeight: 16 },
});
