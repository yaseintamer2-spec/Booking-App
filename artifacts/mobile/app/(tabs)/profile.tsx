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

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user: clerkUser } = useUser();
  const { getToken } = useAuth();
  const [isMatchStaff, setIsMatchStaff] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageSaved, setImageSaved] = useState(false);
  const user = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: true, retry: false } });
  useEffect(() => { let active = true; (async () => { try { const token = await getToken(); const response = await fetch(`${apiBaseUrl}/api/me/match-staff`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const result = await response.json(); if (active) setIsMatchStaff(response.ok && result.isStaff === true); } catch { if (active) setIsMatchStaff(false); } })(); return () => { active = false; }; }, [getToken]);
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
          <View style={[styles.cameraBadge, { backgroundColor: colors.primary }]}>
            {uploadingImage
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Feather name="camera" size={13} color={colors.primaryForeground} />}
          </View>
        </Pressable>
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
      {isMatchStaff ? <Pressable accessibilityRole="button" onPress={() => router.push('/staff-check-in' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="camera" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Staff check-in scanner</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
      {isMatchStaff ? <Pressable accessibilityRole="button" onPress={() => router.push('/referee-matches' as Href)} style={[styles.settingsRow, { borderColor: colors.border }]}><Feather name="activity" size={17} color={colors.primary} /><Text style={[styles.settingsText, { color: colors.foreground }]}>Live match controls</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable> : null}
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
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 25 },
  cameraBadge: { position: 'absolute', right: 0, bottom: 0, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0A100E' },
  initial: { fontSize: 25, fontWeight: '700' },
  photoAction: { paddingVertical: 8, paddingHorizontal: 10 },
  photoActionText: { fontSize: 12, fontWeight: '700' },
  photoMessage: { fontSize: 11, textAlign: 'center', marginTop: 2 },
  name: { fontSize: 18, fontFamily: 'Georgia', marginTop: 8 },
  email: { fontSize: 12, marginTop: 4 },
  line: { height: 1, width: '100%', marginVertical: 18 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', marginBottom: 10 },
  settingsRow: { borderBottomWidth: 1, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  settingsText: { flex: 1, fontSize: 13, fontWeight: '600' },
});

