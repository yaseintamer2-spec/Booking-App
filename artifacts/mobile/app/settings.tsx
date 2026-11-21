import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClerk } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, Screen } from '@/components/KickoffUI';
import { useColors } from '@/hooks/useColors';
import { useAppTheme } from '@/providers/ThemeProvider';
import { saveCurrentDeviceLocation } from '@/lib/deviceLocation';

export default function SettingsScreen() {
  const colors = useColors(); const router = useRouter(); const { signOut } = useClerk(); const [working, setWorking] = useState(false); const [locationWorking, setLocationWorking] = useState(false); const [locationMessage, setLocationMessage] = useState('');
  const { theme, setTheme } = useAppTheme();
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  const logout = () => Alert.alert('Sign out of KICKOFF?', 'You can come back whenever the next game calls.', [{ text: 'Stay', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: async () => { setWorking(true); try { await signOut(); router.replace('/(auth)/welcome'); } catch { setWorking(false); Alert.alert('Could not sign out', 'Please try again.'); } } }]);
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
  return <Screen><BrandHeader back user={user.data} subtitle="PREFERENCES" /><Text style={[styles.kicker, { color: colors.primary }]}>ACCOUNT</Text><Text style={[styles.title, { color: colors.foreground }]}>Settings.</Text>
    <View style={[styles.section, { borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SIGN-IN DETAILS</Text><View style={styles.setting}><Feather name="mail" size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Email</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>{user.data?.email || 'Your verified account email'}</Text></View><Feather name="check-circle" size={15} color={colors.primary} /></View><View style={styles.setting}><Feather name="lock" size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Password</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Managed securely by Clerk</Text></View></View></View>
    <View style={[styles.section, { borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PREFERENCES</Text>
      <View style={styles.appearanceSetting}>
        <View style={styles.appearanceHeading}><Feather name="sun" size={17} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Appearance</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Choose a light or dark look for the whole app.</Text></View></View>
        <View style={[styles.themeChoices, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {(['dark', 'light'] as const).map((option) => {
            const selected = theme === option;
            return <Pressable key={option} accessibilityRole="button" accessibilityLabel={`Use ${option} appearance`} accessibilityState={{ selected }} onPress={() => setTheme(option)} style={[styles.themeChoice, selected && { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name={option === 'dark' ? 'moon' : 'sun'} size={16} color={selected ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.themeChoiceText, { color: selected ? colors.foreground : colors.mutedForeground }]}>{option === 'dark' ? 'Dark' : 'Light'}</Text>
              {selected ? <Feather name="check" size={15} color={colors.primary} /> : null}
            </Pressable>;
          })}
        </View>
      </View>
      <View style={styles.setting}><Feather name="map-pin" size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Match city</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Riyadh · launch city</Text></View></View><View style={styles.setting}><Feather name="bell" size={16} color={colors.primary} /><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Match alerts</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Notification preferences coming later</Text></View></View>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: locationWorking, busy: locationWorking }} disabled={locationWorking} onPress={() => void enableLocation()} style={styles.setting}>
        <Feather name="map-pin" size={16} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>Device location</Text><Text style={[styles.settingCopy, { color: colors.mutedForeground }]}>Optional; coordinates stay on this device.</Text></View>
        <Text style={[styles.locationAction, { color: colors.primary }]}>{locationWorking ? 'Enabling…' : 'Enable'}</Text>
      </Pressable>
      {locationMessage ? <Text accessibilityLiveRegion="polite" style={[styles.settingCopy, { color: locationMessage.startsWith('Location is enabled') ? colors.primary : colors.destructive }]}>{locationMessage}</Text> : null}
    </View>
    <View style={[styles.section, { borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>LEGAL & PRIVACY</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/player-age' as never)} style={styles.setting}><Feather name="user" size={16} color={colors.primary} /><Text style={[styles.settingTitle, { color: colors.foreground, flex: 1 }]}>Match age preference</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>
      {[['Privacy Notice', 'privacy'], ['Terms of Service', 'terms'], ['Cancellations & Refunds', 'refunds'], ['Community Standards', 'community']].map(([label, path]) => <Pressable key={path} accessibilityRole="link" onPress={() => router.push(`/legal/${path}` as never)} style={styles.setting}><Feather name="file-text" size={16} color={colors.primary} /><Text style={[styles.settingTitle, { color: colors.foreground, flex: 1 }]}>{label}</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></Pressable>)}
    </View>
    <Pressable disabled={working} onPress={logout} style={[styles.signOut, { borderColor: colors.border }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>{working ? 'Signing out…' : 'Sign out'}</Text></Pressable>
  </Screen>;
}
const styles = StyleSheet.create({ kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 }, title: { fontSize: 36, fontFamily: 'Georgia', marginTop: 8 }, section: { borderTopWidth: 1, marginTop: 24, paddingTop: 16 }, sectionTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 }, setting: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 13 }, settingTitle: { fontSize: 13, fontWeight: '600' }, settingCopy: { fontSize: 11, marginTop: 4 }, appearanceSetting: { paddingVertical: 12, gap: 12 }, appearanceHeading: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 13 }, themeChoices: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', padding: 4, gap: 4 }, themeChoice: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: 'transparent', borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, themeChoiceText: { fontSize: 13, fontWeight: '700' }, locationAction: { fontSize: 12, fontWeight: '700' }, signOut: { borderWidth: 1, borderRadius: 14, marginTop: 30, height: 52, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }, signOutText: { fontSize: 13, fontWeight: '700' } });
