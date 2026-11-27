import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { saveCurrentDeviceLocation } from '@/lib/deviceLocation';

export default function SettingsScreen() {
  const colors = useColors(); const router = useRouter(); const { signOut } = useClerk(); const [working, setWorking] = useState(false); const [locationWorking, setLocationWorking] = useState(false); const [locationMessage, setLocationMessage] = useState('');
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const logout = () => Alert.alert('Sign out of KORZA | كورزا?', 'You can come back whenever the next game calls.', [{ text: 'Stay', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: async () => { setWorking(true); try { await signOut(); router.replace('/(auth)/welcome'); } catch { setWorking(false); Alert.alert('Could not sign out', 'Please try again.'); } } }]);
  const enableLocation = async () => {
    if (locationWorking) return;
    setLocationWorking(true);
    setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationMessage('Location was not enabled. Allow it in your browser or device settings, then try again.');
        return;
      }
      await saveCurrentDeviceLocation();
      setLocationMessage('Location is enabled. Your coordinates stay on this device.');
    } catch (error) {
      console.error('Failed to enable device location:', error);
      setLocationMessage('Could not get your location on this device. You can try again later.');
    } finally {
      setLocationWorking(false);
    }
  };
  return <Screen><BrandHeader back user={user.data} subtitle="ACCOUNT" /><View style={styles.pageHeading}><Text style={[styles.title, { color: colors.foreground }]}>Settings</Text><Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>Account and match-day preferences.</Text></View>
    <View style={[styles.section, { borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SIGN-IN DETAILS</Text><View style={[styles.setting, { borderBottomColor: colors.border }]}><Feather name="mail" size={17} color={colors.cyan} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Email</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>{user.data?.email || 'Your verified account email'}</Text></View><Feather name="check-circle" size={16} color={colors.primary} /></View><View style={styles.setting}><Feather name="lock" size={17} color={colors.violet} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Password</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Managed securely by Clerk</Text></View></View></View>
    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PREFERENCES</Text>
      <View style={[styles.setting, { borderBottomColor: colors.border }]}><Feather name="map-pin" size={17} color={colors.pink} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Match city</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Riyadh · launch city</Text></View></View><Pressable accessibilityRole="link" onPress={() => router.push('/(tabs)/matches' as never)} style={styles.setting}><Feather name="bell" size={17} color={colors.yellow} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>New match alerts</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Manage alerts from Discover matches</Text></View><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: locationWorking, busy: locationWorking }} disabled={locationWorking} onPress={() => void enableLocation()} style={styles.setting}>
        <Feather name="map-pin" size={17} color={colors.orange} />
        <View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Device location</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Optional; coordinates stay on this device.</Text></View>
        <Text style={[styles.locationAction, { color: colors.primary }]}>{locationWorking ? 'Enabling…' : 'Enable'}</Text>
      </Pressable>
      {locationMessage ? <Text accessibilityLiveRegion="polite" style={[styles.settingCopy, { color: locationMessage.startsWith('Location is enabled') ? colors.primary : colors.destructive }]}>{locationMessage}</Text> : null}
    </View>
    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>LEGAL & PRIVACY</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/player-age' as never)} style={styles.setting}><Feather name="user" size={17} color={colors.violet} /><Text style={[styles.settingTitle, { color: colors.foreground, flex: 1 }]}>Match age preference</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>
      {[['Privacy Notice', 'privacy', 'lock', colors.cyan], ['Terms of Service', 'terms', 'file-text', colors.pink], ['Cancellations & Refunds', 'refunds', 'rotate-ccw', colors.orange], ['Community Standards', 'community', 'users', colors.yellow]].map(([label, path, icon, tone]) => <Pressable key={path as string} accessibilityRole="link" onPress={() => router.push(`/legal/${path}` as never)} style={styles.setting}><Feather name={icon as never} size={17} color={tone as string} /><Text style={[styles.settingTitle, { color: colors.foreground, flex: 1 }]}>{label}</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>)}
    </View>
    <Pressable accessibilityRole="button" disabled={working} onPress={logout} style={[styles.signOut, { borderColor: `${colors.pink}55`, backgroundColor: `${colors.pink}10` }]}><Feather name="log-out" size={17} color={colors.pink} /><Text style={[styles.signOutText, { color: colors.pink }]}>{working ? 'Signing out…' : 'Sign out'}</Text><Feather name="arrow-up-right" size={15} color={colors.pink} /></Pressable>
  </Screen>;
}
const styles = StyleSheet.create({ pageHeading: { marginTop: 8, marginBottom: 4 }, heroCopy: { fontSize: 14, lineHeight: 20, marginTop: 5 }, title: { fontSize: 27, lineHeight: 33, fontWeight: '800' }, section: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 16, paddingTop: 13 }, sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: .3, marginBottom: 5 }, setting: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 3, borderBottomWidth: StyleSheet.hairlineWidth }, settingTitle: { fontSize: 14, fontWeight: '700' }, settingCopy: { fontSize: 13, lineHeight: 18, marginTop: 3 }, locationAction: { fontSize: 13, fontWeight: '800' }, signOut: { borderWidth: 1, borderRadius: 14, marginTop: 22, minHeight: 52, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }, signOutText: { flex: 1, fontSize: 14, fontWeight: '800' } });


