import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useClerk, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { getGetCurrentUserQueryKey, useGetCurrentUser } from '@workspace/api-client-react';

type Props = { visible: boolean; onClose: () => void };

export function AccountMenu({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const access = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: visible, retry: false } });
  const { signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const name = user?.fullName || user?.firstName || 'Player';

  const navigate = (path: '/(tabs)/profile' | '/(tabs)/my-matches' | '/settings' | '/pitch-owner' | '/admin' | '/referee-matches') => {
    onClose();
    router.push(path);
  };

  const confirmSignOut = async () => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await signOut();
      setConfirming(false);
      onClose();
      router.replace('/(auth)/welcome');
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return <>
    <Modal visible={visible && !confirming} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.menu, { bottom: Math.max(insets.bottom, 12) + 70, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.identity, { borderBottomColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
              {user?.imageUrl ? <Image source={{ uri: user.imageUrl }} accessibilityLabel={`${name}'s profile picture`} style={styles.avatarImage} /> : <Feather name="user" size={19} color={colors.primary} />}
            </View>
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.name, { color: colors.foreground }]}>{name}</Text><Text numberOfLines={1} style={[styles.email, { color: colors.mutedForeground }]}>{user?.primaryEmailAddress?.emailAddress || 'Your player account'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close account menu" onPress={onClose} style={styles.close}><Feather name="x" size={18} color={colors.mutedForeground} /></Pressable>
          </View>
          <MenuAction label="My profile" icon="user" color={colors.foreground} onPress={() => navigate('/(tabs)/profile')} />
          <MenuAction label="My matches" icon="calendar" color={colors.foreground} onPress={() => navigate('/(tabs)/my-matches')} />
          {access.data?.isAdmin ? <MenuAction label="Owner & admin console" icon="shield" color={colors.primary} onPress={() => navigate('/admin')} /> : null}
          {access.data?.isAdmin ? <MenuAction label="Referee match desk" icon="activity" color={colors.foreground} onPress={() => navigate('/referee-matches')} /> : null}
          {access.data?.isPitchOwner ? <MenuAction label="Pitch owner desk" icon="flag" color={colors.primary} onPress={() => navigate('/pitch-owner')} /> : null}
          <MenuAction label="Settings" icon="settings" color={colors.foreground} onPress={() => navigate('/settings')} />
          <MenuAction label="Sign out" icon="log-out" color={colors.destructive} onPress={() => setConfirming(true)} />
        </View>
      </View>
    </Modal>
    <Modal visible={visible && confirming} transparent animationType="fade" onRequestClose={() => { setConfirming(false); setError(''); }}>
      <View style={styles.confirmBackdrop}>
        <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
          <View style={[styles.warningIcon, { backgroundColor: `${colors.destructive}1A` }]}><Feather name="log-out" size={21} color={colors.destructive} /></View>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Sign out?</Text>
          <Text style={[styles.confirmCopy, { color: colors.mutedForeground }]}>Are you sure you want to sign out of your player account?</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={working} onPress={() => void confirmSignOut()} style={[styles.signOutButton, { backgroundColor: colors.destructive, opacity: working ? 0.65 : 1 }]}><Text style={styles.signOutText}>{working ? 'Signing out…' : 'Yes, sign out'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={working} onPress={() => { setConfirming(false); setError(''); }} style={[styles.cancelButton, { borderColor: colors.border }]}><Text style={[styles.cancelText, { color: colors.foreground }]}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}

function MenuAction({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof Feather>['name']; color: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}><Feather name={icon} size={17} color={color} /><Text style={[styles.actionLabel, { color }]}>{label}</Text><Feather name="chevron-right" size={15} color={color} /></Pressable>;
}

const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' }, menu: { position: 'absolute', right: 12, width: 284, maxWidth: '92%', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 16 }, identity: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, paddingHorizontal: 5, marginBottom: 4 }, avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, avatarImage: { width: '100%', height: '100%' }, name: { fontSize: 13, fontWeight: '800' }, email: { fontSize: 10, marginTop: 4 }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, action: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 10 }, actionLabel: { flex: 1, fontSize: 13, fontWeight: '700' }, confirmBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 22 }, confirmCard: { width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 2, borderRadius: 22, padding: 22 }, warningIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, confirmTitle: { fontSize: 22, fontWeight: '800', marginTop: 14 }, confirmCopy: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 }, error: { fontSize: 12, marginTop: 10, textAlign: 'center' }, signOutButton: { minHeight: 48, width: '100%', borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, signOutText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, cancelButton: { minHeight: 48, width: '100%', borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, cancelText: { fontSize: 13, fontWeight: '700' } });

