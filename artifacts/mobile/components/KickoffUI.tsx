import React, { useState } from 'react';
import { ImageBackground, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { Match, CurrentUser } from '@workspace/api-client-react';

export const heroImage = require('../assets/images/riyadh-pitch-hero.jpg');
export const cardImage = require('../assets/images/football-match-card.jpg');
export const formatSar = (halalas: number) => {
  const amount = halalas / 100;
  return `SAR ${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
};

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: object }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const content = <View style={[styles.screenContent, { paddingBottom: insets.bottom + 106 }, style]}>{children}</View>;
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    {scroll ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}
  </View>;
}

export function BrandHeader({ title = 'KICKOFF', subtitle, user, back = false }: { title?: string; subtitle?: string; user?: CurrentUser; back?: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const menu = [
    ['Wallet', '/wallet', 'credit-card'],
    ['Profile', '/(tabs)/profile', 'user'],
    ['Settings', '/settings', 'sliders'],
    ['Rankings', '/(tabs)/rankings', 'award'],
    ...(user?.isAdmin ? [['Admin console', '/admin', 'shield'] as string[]] : []),
  ];
  return <>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) + 8 }]}>
      {back ? <Pressable onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Go back"><Feather name="arrow-left" size={21} color={colors.foreground} /></Pressable> :
        <Pressable onPress={() => router.push('/(tabs)')} style={styles.brandLockup}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><Feather name="activity" size={15} color={colors.primaryForeground} /></View><Text style={[styles.brand, { color: colors.foreground }]}>{title}</Text></Pressable>}
      <View style={styles.headerRight}>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        <Pressable style={[styles.menuButton, { borderColor: colors.border }]} onPress={() => setOpen(true)} accessibilityLabel="Open navigation menu" testID="open-drawer">
          <View style={[styles.menuLine, { backgroundColor: colors.foreground }]} /><View style={[styles.menuLine, { backgroundColor: colors.foreground }]} /><View style={[styles.menuLine, { backgroundColor: colors.foreground }]} />
        </Pressable>
      </View>
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.drawerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View style={[styles.drawer, { backgroundColor: colors.card, paddingTop: insets.top + 20 }]}>
          <View style={styles.drawerTop}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>RIYADH · 7V7</Text><Text style={[styles.drawerTitle, { color: colors.foreground }]}>Your game,{'\n'}already organized.</Text></View><Pressable onPress={() => setOpen(false)} style={styles.closeButton}><Feather name="x" size={20} color={colors.foreground} /></Pressable></View>
          <View style={[styles.drawerProfile, { borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.avatarText, { color: colors.accentForeground }]}>{(user?.name || 'K').slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}><Text style={[styles.drawerName, { color: colors.foreground }]}>{user?.name || 'Player'}</Text><Text style={[styles.small, { color: colors.mutedForeground }]}>{user?.email || 'Your football profile'}</Text></View>
          </View>
          <View style={{ gap: 5, marginTop: 20 }}>
            {menu.map(([label, path, icon]) => <Pressable key={path} style={styles.drawerItem} onPress={() => { setOpen(false); router.push(path as never); }}><Feather name={icon as never} size={18} color={colors.mutedForeground} /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>{label}</Text><Feather name="arrow-up-right" size={15} color={colors.mutedForeground} /></Pressable>)}
          </View>
          <View style={{ flex: 1 }} />
          <View style={[styles.drawerFoot, { borderColor: colors.border }]}><Text style={[styles.small, { color: colors.mutedForeground }]}>KICKOFF / RIYADH</Text><Text style={[styles.small, { color: colors.mutedForeground }]}>The pitch is waiting.</Text></View>
        </View>
      </View>
    </Modal>
  </>;
}

export function SectionTitle({ kicker, title, action, onAction }: { kicker?: string; title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.sectionTitleRow}><View>{kicker ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{kicker}</Text> : null}<Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{action ? <Pressable onPress={onAction}><Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function MatchCard({ match, compact = false, onPress }: { match: Match; compact?: boolean; onPress?: () => void }) {
  const colors = useColors();
  const start = new Date(match.startsAt);
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const price = formatSar(match.priceHalalas);
  const compare = formatSar(match.compareAtPriceHalalas);
  return <Pressable onPress={onPress} style={[styles.matchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <ImageBackground source={match.imageUrl ? { uri: match.imageUrl } : cardImage} style={[styles.matchPhoto, compact && { height: 126 }]} imageStyle={{ borderTopLeftRadius: 18, borderTopRightRadius: 18 }}>
      <View style={styles.photoShade} />
      <View style={styles.photoPills}><Text style={[styles.photoPill, { color: colors.foreground, backgroundColor: 'rgba(8,16,12,.74)' }]}>7V7 · RIYADH</Text><Text style={[styles.spotsPill, { color: colors.primaryForeground, backgroundColor: colors.primary }]}>{match.spotsRemaining} SPOTS LEFT</Text></View>
      <View style={styles.photoVenue}><Text style={[styles.venueName, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.venueLocation, { color: colors.secondaryForeground }]}>{match.neighborhood}  /  {day}</Text></View>
    </ImageBackground>
    <View style={styles.matchInfo}>
      <View style={styles.matchFacts}><Feather name="clock" size={14} color={colors.primary} /><Text style={[styles.factText, { color: colors.foreground }]}>{time}</Text><View style={[styles.factDot, { backgroundColor: colors.border }]} /><Text style={[styles.factText, { color: colors.mutedForeground }]}>{match.durationMinutes} min</Text></View>
      <View style={styles.priceBlock}><Text style={[styles.oldPrice, { color: colors.mutedForeground }]}>{compare}</Text><Text style={[styles.price, { color: colors.foreground }]}>{price}</Text></View>
    </View>
    <View style={[styles.perksRow, { borderTopColor: colors.border }]}>
      <Perk icon="check-circle" label={match.refereeIncluded ? 'Referee included' : 'No referee'} active={match.refereeIncluded} />
      <Perk icon="droplet" label={match.waterIncluded ? 'Water provided' : 'Bring water'} active={match.waterIncluded} />
      <Feather name="arrow-up-right" size={16} color={colors.primary} />
    </View>
  </Pressable>;
}

function Perk({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  const colors = useColors();
  return <View style={styles.perk}><Feather name={icon as never} size={13} color={active ? colors.primary : colors.mutedForeground} /><Text style={[styles.perkText, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'numeric'; multiline?: boolean }) {
  const colors = useColors();
  return <View style={{ gap: 8, marginBottom: 16 }}><Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} multiline={multiline} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }, multiline && { minHeight: 84, textAlignVertical: 'top' }]} /></View>;
}

export function Button({ label, onPress, secondary = false, disabled = false, icon }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: string }) {
  const colors = useColors();
  return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: disabled ? 0.48 : pressed ? 0.84 : 1 }, secondary && { borderColor: colors.border, borderWidth: 1 }]}><Text style={[styles.buttonText, { color: secondary ? colors.foreground : colors.primaryForeground }]}>{label}</Text>{icon ? <Feather name={icon as never} size={17} color={secondary ? colors.foreground : colors.primaryForeground} /> : null}</Pressable>;
}

export function EmptyState({ title, body, icon = 'flag', action, onAction }: { title: string; body: string; icon?: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.accent }]}><Feather name={icon as never} size={22} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>{action && onAction ? <Pressable onPress={onAction} style={styles.emptyAction}><Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text><Feather name="refresh-cw" size={14} color={colors.primary} /></Pressable> : null}</View>;
}

export function LoadingState() {
  const colors = useColors();
  return <View style={{ gap: 12, marginTop: 18 }}>{[1, 2].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.skeletonImage, { backgroundColor: colors.secondary }]} /><View style={{ flex: 1, gap: 10 }}><View style={[styles.skeletonBar, { width: '70%', backgroundColor: colors.secondary }]} /><View style={[styles.skeletonBar, { width: '45%', backgroundColor: colors.secondary }]} /></View></View>)}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 20, paddingTop: 8 },
  header: { minHeight: 78, paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 15, letterSpacing: 2.2, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerSubtitle: { fontSize: 12, letterSpacing: 0.4 },
  menuButton: { height: 42, width: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  menuLine: { height: 1.5, width: 17, borderRadius: 1 },
  headerIcon: { width: 42, height: 42, justifyContent: 'center' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', flexDirection: 'row', justifyContent: 'flex-end' },
  drawer: { width: '86%', maxWidth: 370, height: '100%', paddingHorizontal: 24, paddingBottom: 32 },
  drawerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 18 },
  closeButton: { padding: 8 },
  drawerTitle: { fontSize: 28, lineHeight: 34, fontWeight: '600', fontFamily: 'Georgia', marginTop: 8 },
  drawerProfile: { borderBottomWidth: 1, borderTopWidth: 1, marginTop: 25, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  drawerName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  small: { fontSize: 11 },
  drawerItem: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 5 },
  drawerItemText: { flex: 1, fontSize: 15, fontWeight: '500' },
  drawerFoot: { borderTopWidth: 1, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 26, marginBottom: 14 },
  sectionTitle: { fontSize: 23, fontFamily: 'Georgia', marginTop: 4 },
  actionText: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  matchCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  matchPhoto: { height: 188, justifyContent: 'space-between', padding: 14 },
  photoShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,8,0.25)' },
  photoPills: { flexDirection: 'row', justifyContent: 'space-between' },
  photoPill: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, overflow: 'hidden' },
  spotsPill: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, overflow: 'hidden' },
  photoVenue: { gap: 3 },
  venueName: { fontSize: 21, fontFamily: 'Georgia', fontWeight: '600' },
  venueLocation: { fontSize: 11, letterSpacing: 0.6 },
  matchInfo: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  matchFacts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { fontSize: 12, fontWeight: '600' },
  factDot: { width: 3, height: 3, borderRadius: 3, marginHorizontal: 1 },
  priceBlock: { alignItems: 'flex-end', gap: 1 },
  oldPrice: { fontSize: 10, textDecorationLine: 'line-through' },
  price: { fontSize: 16, fontWeight: '700' },
  perksRow: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  perkText: { fontSize: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  button: { minHeight: 54, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  emptyState: { padding: 22, borderRadius: 18, borderWidth: 1, alignItems: 'flex-start', marginTop: 10 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 17 },
  emptyTitle: { fontSize: 19, fontFamily: 'Georgia', marginBottom: 7 },
  emptyBody: { fontSize: 13, lineHeight: 20 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, paddingVertical: 5 },
  skeleton: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', gap: 14, height: 112, alignItems: 'center' },
  skeletonImage: { width: 88, height: 84, borderRadius: 12 },
  skeletonBar: { height: 10, borderRadius: 6 },
});
