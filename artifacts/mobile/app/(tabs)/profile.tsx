import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';
import { BrandHeader, EmptyState, Screen } from '@/components/KickoffUI';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { useColors } from '@/hooks/useColors';
import { PLAYER_POSITIONS, PositionBadge, PreferredPositionPicker, isPlayerPosition, type PlayerPosition } from '@/components/PreferredPositionPicker';

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const [isMatchStaff, setIsMatchStaff] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSaved, setImageSaved] = useState(false);
  const [preferredPosition, setPreferredPosition] = useState<PlayerPosition | null>(null);
  const [positionDraft, setPositionDraft] = useState<PlayerPosition>('striker');
  const [editingPosition, setEditingPosition] = useState(false);
  const [savingPosition, setSavingPosition] = useState(false);
  const [positionError, setPositionError] = useState('');
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/match-staff`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active) setIsMatchStaff(response.ok && result.isStaff === true); } catch { if (active) setIsMatchStaff(false); } })(); return () => { active = false; }; }, [getToken]);
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/preferred-position`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (response.ok && active && isPlayerPosition(result.preferredPosition)) { setPreferredPosition(result.preferredPosition); setPositionDraft(result.preferredPosition); } } catch { /* Keep the position editable if it cannot be loaded yet. */ } })(); return () => { active = false; }; }, [getToken]);
  const savePosition = async () => {
    setSavingPosition(true); setPositionError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBaseUrl}/api/me/preferred-position`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ preferredPosition: positionDraft }) });
      const result = await response.json();
      if (!response.ok || !isPlayerPosition(result.preferredPosition)) throw new Error(result.error || 'Could not save your preferred position.');
      setPreferredPosition(result.preferredPosition); setEditingPosition(false);
    } catch (error) { setPositionError(error instanceof Error ? error.message : 'Could not save your preferred position.'); }
    finally { setSavingPosition(false); }
  };
  const chooseProfileImage = async () => {
    if (!clerkUser || uploadingImage) return;

    setUploadingImage(true);
    setImageError(null);
    setImageSaved(false);
    try {
      let file: File | string;
      if (Platform.OS === 'web') {
        const browserFile = await chooseBrowserImage();
        if (!browserFile) return;
        file = browserFile;
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setImageError('Photo access was not granted. Allow access in your device settings to choose a photo.');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (result.canceled) return;

        const image = result.assets[0];
        if (!image?.uri) {
          throw new Error('The selected image could not be read.');
        }

        file = image.uri;
      }

      await clerkUser.setProfileImage({ file });
      await clerkUser.reload();
      setImageSaved(true);
      try {
        const token = await getToken();
        const response = await fetch(`${apiBaseUrl}/api/me/avatar`, {
          method: 'PATCH',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not refresh match lineups.');
      } catch (syncError) {
        setImageError(syncError instanceof Error
          ? `Profile picture updated, but match lineups could not be refreshed: ${syncError.message}`
          : 'Profile picture updated, but match lineups could not be refreshed. Try again later.');
      }
    } catch (error) {
      console.error('Failed to update profile picture:', error);
      setImageError(error instanceof Error ? error.message : 'Could not update your profile picture. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const profileImageUrl = clerkUser?.imageUrl;
  const imageLabel = profileImageUrl ? 'Change profile picture' : 'Add profile picture';

  return (
    <Screen>
      <BrandHeader user={user.data} subtitle="PLAYER CARD" />
      <Text style={[styles.kicker, { color: colors.primary }]}>YOUR KICKOFF PROFILE</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Player profile.</Text>
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.avatarWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={imageLabel}
          accessibilityState={{ disabled: !clerkUser || uploadingImage, busy: uploadingImage }}
          disabled={!clerkUser || uploadingImage}
          onPress={chooseProfileImage}
          style={[styles.avatar, { backgroundColor: colors.accent, borderColor: colors.primary, opacity: uploadingImage ? 0.7 : 1 }]}
          testID="profile-picture-picker"
        >
          {profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.initial, { color: colors.primary }]}>
              {(user.data?.name || 'K').slice(0, 1).toUpperCase()}
            </Text>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}>
            {uploadingImage
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Feather name="camera" size={13} color={colors.primaryForeground} />}
          </View>
        </Pressable>
        <PositionBadge position={preferredPosition} style={styles.avatarPositionBadge} />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!clerkUser || uploadingImage}
          onPress={chooseProfileImage}
          style={styles.photoAction}
          testID="profile-picture-action"
        >
          <Text style={[styles.photoActionText, { color: colors.primary }]}>
            {uploadingImage ? 'Updating photo…' : imageLabel}
          </Text>
        </Pressable>
        {imageError ? <Text accessibilityLiveRegion="polite" style={[styles.photoMessage, { color: colors.destructive }]}>{imageError}</Text> : null}
        {imageSaved ? <Text accessibilityLiveRegion="polite" style={[styles.photoMessage, { color: colors.primary }]}>Profile picture updated.</Text> : null}
        <Text style={[styles.name, { color: colors.foreground }]}>{user.data?.name || 'Player'}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]}>{user.data?.email || ' '}</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <View style={styles.info}>
          <Feather name="map-pin" size={15} color={colors.primary} />
          <Text style={[styles.email, { color: colors.mutedForeground }]}>Riyadh, Saudi Arabia</Text>
        </View>
        <View style={styles.info}>
          <Feather name="users" size={15} color={colors.primary} />
          <Text style={[styles.email, { color: colors.mutedForeground }]}>7v7 player</Text>
        </View>
      </View>
      <View style={[styles.positionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.positionCardTop}><View style={[styles.positionIcon, { backgroundColor: colors.secondary }]}><Feather name="activity" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.positionCardTitle, { color: colors.foreground }]}>Preferred position</Text><Text style={[styles.email, { color: colors.mutedForeground, marginTop: 3 }]}>{PLAYER_POSITIONS.find(item => item.value === preferredPosition)?.label || 'Choose your profile position'}</Text></View><Pressable accessibilityRole="button" onPress={() => { setPositionDraft(preferredPosition || 'striker'); setEditingPosition(value => !value); setPositionError(''); }} style={[styles.positionChangeButton, { borderColor: colors.border }]}><Text style={[styles.positionChangeText, { color: colors.primary }]}>{editingPosition ? 'Close' : preferredPosition ? 'Change' : 'Choose'}</Text></Pressable></View>
        {editingPosition ? <><Text style={[styles.positionHint, { color: colors.mutedForeground }]}>This badge is for your profile only. It does not affect match registration or team selection.</Text><PreferredPositionPicker selected={positionDraft} onSelect={setPositionDraft} />{positionError ? <Text accessibilityRole="alert" style={[styles.positionError, { color: colors.destructive }]}>{positionError}</Text> : null}<Pressable accessibilityRole="button" disabled={savingPosition} onPress={() => void savePosition()} style={[styles.positionSaveButton, { backgroundColor: colors.primary, opacity: savingPosition ? .6 : 1 }]}><Text style={[styles.positionSaveText, { color: colors.primaryForeground }]}>{savingPosition ? 'Saving…' : 'Save position'}</Text></Pressable></> : null}
      </View>
      {isMatchStaff ? <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="camera" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Staff check-in scanner</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
      {isMatchStaff ? <Pressable accessibilityRole="button" onPress={() => router.push('/referee-matches' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="activity" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Live match controls</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
      {user.data?.isAdmin ? <Pressable accessibilityRole="button" onPress={() => router.push('/admin' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="shield" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Admin console</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
      {user.data?.isPitchOwner ? <Pressable accessibilityRole="button" onPress={() => router.push('/pitch-owner' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="flag" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Pitch owner desk</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
      <Pressable onPress={() => router.push('/settings')} style={[styles.settingsRow, { borderColor: colors.border }]}>
        <Feather name="settings" size={17} color={colors.mutedForeground} />
        <Text style={[styles.settingsText, { color: colors.foreground }]}>Account settings</Text>
        <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
      </Pressable>
      <EmptyState icon="bar-chart-2" title="Your stats start on the pitch." body="Match history and player performance will be connected here as the product's player activity API becomes available." />
    </Screen>
  );
}

function chooseBrowserImage(): Promise<File | null> {
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('The browser file picker is unavailable.'));
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    const finish = (file: File | null) => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
      resolve(file);
    };
    const onChange = () => finish(input.files?.[0] ?? null);
    const onCancel = () => finish(null);
    input.addEventListener('change', onChange, { once: true });
    input.addEventListener('cancel', onCancel, { once: true });
    input.click();
  });
}

const styles = StyleSheet.create({
  kicker: { fontSize: 10, letterSpacing: 1.8, fontWeight: '700', marginTop: 18 },
  title: { fontSize: 35, fontFamily: 'Georgia', marginTop: 8 },
  profileCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', marginTop: 21 },
  avatarWrap: { width: 50, height: 50, marginTop: 2, marginBottom: 5 },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 25 },
  avatarPositionBadge: { position: 'absolute', left: -7, bottom: -4 },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A100E' },
  initial: { fontSize: 25, fontWeight: '700' },
  photoAction: { paddingVertical: 8, paddingHorizontal: 10 },
  photoActionText: { fontSize: 12, fontWeight: '700' },
  photoMessage: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  name: { fontSize: 18, fontFamily: 'Georgia', marginTop: 8 },
  email: { fontSize: 12, marginTop: 4 },
  line: { height: 1, width: '100%', marginVertical: 18 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', marginBottom: 10 },
  positionCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 12 },
  positionCardTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  positionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  positionCardTitle: { fontSize: 12, fontWeight: '800' },
  positionChangeButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  positionChangeText: { fontSize: 10, fontWeight: '800' },
  positionHint: { fontSize: 10, lineHeight: 15, marginTop: 12, marginBottom: 10 },
  positionError: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  positionSaveButton: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 11 },
  positionSaveText: { fontSize: 11, fontWeight: '900' },
  settingsRow: { borderBottomWidth: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  settingsText: { flex: 1, fontSize: 13, fontWeight: '600' },
});

