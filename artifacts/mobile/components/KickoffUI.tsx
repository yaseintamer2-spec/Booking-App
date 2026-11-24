import React, { useState, useEffect, useRef } from 'react';
import { Image, ImageBackground, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk, useSSO, useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { IconBadge, type AccentTone } from './IconBadge';
import type { Match, CurrentUser } from '@workspace/api-client-react';
import { NotificationsButton } from './NotificationsButton';

WebBrowser.maybeCompleteAuthSession();

export const heroImage = require('../assets/images/riyadh-pitch-hero.jpg');
export const homeHeroImage = heroImage;
export const cardImage = require('../assets/images/football-match-card.jpg');
export const formatSar = (halalas: number) => {
  const amount = halalas / 100;
  return `SAR ${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`;
};

export function formatRiyadhDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function formatRiyadhTime(value: string | Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatRiyadhDateTime(value: string | Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function toRiyadhLocalInput(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

export function parseRiyadhLocalInput(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+03:00`);
  const expected = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  return Number.isNaN(date.getTime()) || toRiyadhLocalInput(date) !== expected ? null : date;
}

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
}

export function GoogleSignInButton({ disabled = false, legalConsent = false }: { disabled?: boolean; legalConsent?: boolean }) {
  const colors = useColors();
  const router = useRouter();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useWarmUpBrowser();

  const continueWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'kickoff' }),
      });
      if (!createdSessionId) {
        setError('Google could not finish account setup. Try email sign-in or enable Google in Auth settings.');
        return;
      }
      await setActive!({
        session: createdSessionId,
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            setError('Finish the required account step, then return to KICKOFF.');
            return;
          }
          router.replace(decorateUrl(legalConsent ? '/legal/accept?consent=1' : '/(auth)/preferred-position') as never);
        },
      });
    } catch {
      setError('Google sign-in is unavailable. Enable Google in Auth settings or continue with email.');
    } finally {
      setBusy(false);
    }
  };

  return <View>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      testID="continue-with-google"
      onPress={continueWithGoogle}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.googleButton, { opacity: busy || disabled ? 0.55 : pressed ? 0.82 : 1 }]}
    >
      <GoogleLogo />
      <Text style={styles.googleText}>{busy ? 'Connecting…' : 'Continue with Google'}</Text>
    </Pressable>
    {error ? <Text style={[styles.googleError, { color: colors.destructive }]}>{error}</Text> : null}
  </View>;
}

function GoogleLogo() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" style={styles.googleLogo} accessibilityLabel="Google">
    <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <Path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.23 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z" />
    <Path fill="#EA4335" d="M12 5.27c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.63 6.16-4.63z" />
  </Svg>;
}

export function Screen({ children, scroll = true, style, refreshing, onRefresh }: { children: React.ReactNode; scroll?: boolean; style?: object; refreshing?: boolean; onRefresh?: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const content = <View style={[styles.screenContent, { paddingBottom: insets.bottom + 106 }, style]}>{children}</View>;
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    {scroll ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}>{content}</ScrollView> : content}
  </View>;
}

export function BrandHeader({ title = 'KICKOFF', subtitle, user, back = false, hideMenu = false, onBack, backFallback = '/(tabs)' }: { title?: string; subtitle?: string; user?: CurrentUser; back?: boolean; hideMenu?: boolean; onBack?: () => void; backFallback?: Href }) {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useClerk();
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (onBack) { onBack(); return; }
    if (router.canGoBack()) router.back();
    else router.replace(backFallback);
  };
  const menu = [
    ['Wallet', '/wallet', 'credit-card'],
    ['My matches', '/(tabs)/my-matches', 'calendar'],
    ['Profile', '/(tabs)/profile', 'user'],
    ['Settings', '/settings', 'sliders'],
    ['Rankings', '/(tabs)/rankings', 'award'],
    ...(user?.isAdmin ? [['Admin console', '/admin', 'shield'] as string[]] : []),
  ];
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
      queryClient.clear();
      setOpen(false);
      router.replace('/(auth)/welcome');
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  };
  return <>
    <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) + 8 }]}>
      {back ? <Pressable onPress={handleBack} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Go back"><Feather name="arrow-left" size={21} color={colors.foreground} /></Pressable> :
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.brandLockup}><View style={[styles.brandMark, { backgroundColor: colors.primary }]}><Feather name="activity" size={15} color={colors.primaryForeground} /></View><Text style={[styles.brand, { color: colors.foreground }]}>{title}</Text></Pressable>}
      <View style={styles.headerRight}>
        {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        <NotificationsButton />
        {!hideMenu ? <Pressable style={[styles.menuButton, { borderColor: colors.border }]} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open navigation menu" testID="open-drawer">
          <View style={[styles.menuLine, { backgroundColor: colors.foreground }]} /><View style={[styles.menuLine, { backgroundColor: colors.foreground }]} /><View style={[styles.menuLine, { backgroundColor: colors.foreground }]} />
        </Pressable> : null}
      </View>
    </View>
    {!hideMenu ? <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.drawerBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <ScrollView showsVerticalScrollIndicator={false} style={[styles.drawer, { backgroundColor: colors.card }]} contentContainerStyle={[styles.drawerContent, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 0) + 20, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 24 }]}>
          <View style={styles.drawerTop}><Text style={[styles.drawerTitle, { color: colors.foreground }]}>Menu</Text><Pressable onPress={() => setOpen(false)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close navigation menu"><Feather name="x" size={20} color={colors.foreground} /></Pressable></View>
          <View style={[styles.drawerProfile, { borderColor: colors.border }]}>
            <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
              {clerkUser?.imageUrl
                ? <Image source={{ uri: clerkUser.imageUrl }} style={styles.avatarImage} />
                : <Text style={[styles.avatarText, { color: colors.accentForeground }]}>{(user?.name || 'K').slice(0, 1).toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}><Text style={[styles.drawerName, { color: colors.foreground }]}>{user?.name || 'Player'}</Text><Text style={[styles.small, { color: colors.mutedForeground }]}>{user?.email || 'Your football profile'}</Text></View>
          </View>
          <View style={{ gap: 5, marginTop: 20 }}>
            {menu.map(([label, path, icon], index) => { const tones: AccentTone[] = ['primary', 'pink', 'cyan', 'yellow', 'violet', 'orange']; return <Pressable key={path} accessibilityRole="button" testID={`drawer-${label.toLowerCase().replaceAll(' ', '-')}`} style={({ pressed }) => [styles.drawerItem, { opacity: pressed ? 0.68 : 1 }]} onPress={() => { setOpen(false); router.push(path as never); }}><IconBadge name={icon as never} tone={tones[index % tones.length]} size="small" /><Text style={[styles.drawerItemText, { color: colors.foreground }]}>{label}</Text><Feather name="arrow-up-right" size={15} color={colors.mutedForeground} /></Pressable>; })}
          </View>
          <View style={styles.drawerSpacer} />
          <Pressable onPress={handleSignOut} disabled={signingOut} accessibilityRole="button" testID="drawer-sign-out" style={[styles.signOutButton, { borderColor: colors.border, opacity: signingOut ? 0.55 : 1 }]}><Feather name="log-out" size={16} color={colors.destructive} /><Text style={[styles.signOutText, { color: colors.destructive }]}>{signingOut ? 'Signing out…' : 'Sign out'}</Text></Pressable>
          {signOutError ? <Text style={[styles.small, { color: colors.destructive, marginTop: 8 }]}>Could not sign out. Please try again.</Text> : null}
          <View style={[styles.drawerFoot, { borderColor: colors.border }]}><Text style={[styles.small, { color: colors.mutedForeground }]}>KICKOFF · RIYADH</Text></View>
        </ScrollView>
      </View>
    </Modal> : null}
  </>;
}

export function SectionTitle({ kicker, title, action, onAction }: { kicker?: string; title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.sectionTitleRow}><View>{kicker ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{kicker}</Text> : null}<Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text></View>{action ? <Pressable onPress={onAction}><Text style={[styles.actionText, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function MatchCard({ match, compact = false, recommended = false, onPress }: { match: Match; compact?: boolean; recommended?: boolean; onPress?: () => void }) {
  const colors = useColors();
  const start = new Date(match.startsAt);
  const day = formatRiyadhDate(start);
  const time = formatRiyadhTime(start);
  const price = formatSar(match.priceHalalas);
  const compare = formatSar(match.compareAtPriceHalalas);
  const photos = match.imageUrls?.length ? match.imageUrls.slice(0, 3) : match.imageUrl && (/^https:\/\//i.test(match.imageUrl) || /^data:image\//i.test(match.imageUrl)) ? [match.imageUrl] : [];
  const gallery = photos.length ? photos : [null];
  const galleryKey = gallery.join('|');
  const [activePhoto, setActivePhoto] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});
  const [photoWidth, setPhotoWidth] = useState(320);
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => { setFailedPhotos({}); setActivePhoto(0); scrollRef.current?.scrollTo({ x: 0, animated: false }); }, [match.id, galleryKey]);
  useEffect(() => {
    if (gallery.length < 2) return;
    const timer = setInterval(() => setActivePhoto(current => {
      const next = (current + 1) % gallery.length;
      scrollRef.current?.scrollTo({ x: next * photoWidth, animated: true });
      return next;
    }), 5000);
    return () => clearInterval(timer);
  }, [gallery.length, photoWidth]);
  const goToPhoto = (index: number) => { setActivePhoto(index); scrollRef.current?.scrollTo({ x: index * photoWidth, animated: true }); };
  return <View testID={`match-${match.id}`} style={[styles.matchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <View style={[styles.gallery, compact && { height: 174 }]} onLayout={event => setPhotoWidth(event.nativeEvent.layout.width)}>
      <ScrollView ref={scrollRef} horizontal pagingEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setActivePhoto(Math.min(gallery.length - 1, Math.round(event.nativeEvent.contentOffset.x / photoWidth)))}>
        {gallery.map((photo, index) => <Pressable key={`${index}-${photo?.slice(0, 22) || 'default'}`} accessibilityRole="button" accessibilityLabel={`Open registration for ${match.venueName}, pitch photo ${index + 1} of ${gallery.length}`} onPress={onPress}><ImageBackground source={failedPhotos[photo || 'default'] ? cardImage : matchCardPhotoSource(photo)} onError={() => setFailedPhotos(current => ({ ...current, [photo || 'default']: true }))} resizeMode="cover" style={[styles.matchPhoto, { width: photoWidth }, compact && { height: 174 }]}>
          <View style={styles.photoShade} />
          <View style={styles.photoPills}><Text style={[styles.photoPill, { color: match.isDemo ? colors.destructive : colors.foreground, backgroundColor: 'rgba(8,16,12,.82)' }]}>{match.isDemo ? 'DEMO LISTING' : '7V7 · RIYADH'}</Text><Text style={[styles.spotsPill, { color: colors.primaryForeground, backgroundColor: colors.primary }]}>{match.spotsRemaining} SPOTS LEFT</Text></View>
          {gallery.length === 1 ? <View style={styles.photoVenue}><Text style={[styles.venueName, { color: colors.foreground }]}>{match.venueName}</Text><Text style={[styles.venueLocation, { color: colors.secondaryForeground }]}>{match.neighborhood}  /  {day}</Text></View> : null}
        </ImageBackground></Pressable>)}
      </ScrollView>
      {gallery.length > 1 ? <View style={styles.galleryDots}>{gallery.map((_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Show pitch photo ${index + 1} of ${gallery.length}`} onPress={() => goToPhoto(index)} style={styles.galleryDotHit}><View style={[styles.galleryDot, { backgroundColor: index === activePhoto ? colors.googleBlue : 'rgba(232,238,233,.72)' }]} /></Pressable>)}</View> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={`${match.venueName}, ${/^https?:\/\//i.test(match.address || '') ? 'Google Maps location available' : match.address}, ${formatSar(match.priceHalalas)} per player. Open match registration.`} onPress={onPress} style={styles.matchBody}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingTop: 12 }}><Text style={[styles.ageGroupPill, { color: colors.violet, backgroundColor: `${colors.violet}20` }]}>AGES {match.ageGroup.replace('-', '–')}</Text>{recommended ? <Text accessibilityLabel="Recommended age group for you" style={[styles.ageGroupPill, { color: colors.primaryForeground, backgroundColor: colors.primary }]}>RECOMMENDED</Text> : null}</View>
    <View style={styles.matchInfo}>
      <View style={styles.matchTitleLocation}><Text numberOfLines={1} style={[styles.venueName, { color: colors.foreground }]}>{match.venueName}</Text><View style={styles.cardLocation}><Feather name="map-pin" size={14} color={colors.pink} /><Text numberOfLines={1} style={[styles.venueLocation, { color: colors.mutedForeground }]}>{match.neighborhood} · {/^https?:\/\//i.test(match.address || '') ? 'Google Maps location' : match.address}</Text></View><View style={styles.matchMetaRow}><View accessibilityLabel={match.pitchRatingAverage === null ? 'Pitch has no ratings yet' : `Pitch rating ${match.pitchRatingAverage.toFixed(1)} out of 5, ${match.pitchRatingCount} ratings`} style={[styles.pitchRating, { backgroundColor: `${colors.yellow}20` }]}><Feather name="star" size={13} color={colors.yellow} /><Text style={[styles.pitchRatingText, { color: colors.foreground }]}>{match.pitchRatingAverage === null ? 'New pitch' : `${match.pitchRatingAverage.toFixed(1)} · ${match.pitchRatingCount}`}</Text></View>{match.refereeName ? <View style={styles.refereeBadge}>{match.refereeAvatarUrl ? <Image accessibilityLabel={`${match.refereeName}, assigned referee`} source={{ uri: match.refereeAvatarUrl }} style={styles.refereePhoto} /> : <View style={[styles.refereePhoto, { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }]}><Feather name="user" size={11} color={colors.mutedForeground} /></View>}<Text numberOfLines={1} style={[styles.refereeText, { color: colors.mutedForeground }]}>{match.refereeName}</Text></View> : null}</View></View>
      <View style={styles.matchInfoRight}><View style={styles.matchFacts}><Feather name="clock" size={15} color={colors.cyan} /><Text style={[styles.factText, { color: colors.foreground }]}>{time}</Text><View style={[styles.factDot, { backgroundColor: colors.border }]} /><Text style={[styles.factText, { color: colors.mutedForeground }]}>{match.durationMinutes} min</Text></View><View style={styles.priceBlock}><Text style={[styles.priceCaption, { color: colors.mutedForeground }]}>PER PLAYER</Text><Text style={[styles.oldPrice, { color: colors.destructive }]}>{compare}</Text><View style={styles.priceValue}><Feather name="credit-card" size={14} color={colors.orange} /><Text style={[styles.price, { color: colors.orange }]}>{price}</Text></View></View></View>
    </View>
    <View style={[styles.perksRow, { borderTopColor: colors.border }]}>
      <Perk icon="check-circle" label={match.refereeIncluded ? 'Referee included' : 'No referee'} active={match.refereeIncluded} />
      <Perk icon="droplet" label={match.waterIncluded ? 'Water provided' : 'Bring water'} active={match.waterIncluded} />
      <Feather name="arrow-up-right" size={16} color={colors.primary} />
    </View>
    </Pressable>
  </View>;
}

function matchCardPhotoSource(photo: string | null) {
  if (photo === 'local:football-match-card') return require('../assets/images/football-match-card.jpg');
  if (photo === 'local:home-pitch-hero') return require('../assets/images/home-pitch-hero.jpg');
  if (photo === 'local:home-stadium-sunset') return require('../assets/images/home-stadium-sunset.png');
  return photo ? { uri: photo } : cardImage;
}

function Perk({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  const colors = useColors();
  return <View style={styles.perk}><Feather name={icon as never} size={14} color={active ? colors.primary : colors.mutedForeground} /><Text style={[styles.perkText, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline, autoComplete }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad'; multiline?: boolean; autoComplete?: 'email' | 'current-password' | 'new-password' | 'off' }) {
  const colors = useColors();
  const [passwordVisible, setPasswordVisible] = useState(false);
  return <View style={{ gap: 8, marginBottom: 16 }}>
    <Text style={[styles.fieldLabel, { color: colors.secondaryForeground }]}>{label}</Text>
    <View style={styles.inputWrap}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} secureTextEntry={secureTextEntry && !passwordVisible} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' || secureTextEntry || keyboardType === 'numeric' || keyboardType === 'phone-pad' ? 'none' : 'sentences'} autoCorrect={keyboardType === 'email-address' || secureTextEntry ? false : undefined} autoComplete={autoComplete} multiline={multiline} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }, secureTextEntry && styles.passwordInput, multiline && { minHeight: 84, textAlignVertical: 'top' }]} />
      {secureTextEntry ? <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'} onPress={() => setPasswordVisible(value => !value)} style={styles.passwordToggle}><Feather name={passwordVisible ? 'eye-off' : 'eye'} size={17} color={colors.mutedForeground} /></Pressable> : null}
    </View>
  </View>;
}

export function Button({ label, onPress, secondary = false, disabled = false, icon }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: string }) {
  const colors = useColors();
  return <Pressable accessibilityRole="button" onPress={() => { if (Platform.OS !== 'web') void Haptics.selectionAsync(); onPress(); }} disabled={disabled} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: disabled ? 0.48 : pressed ? 0.84 : 1 }, secondary && { borderColor: colors.border, borderWidth: 1 }]}><Text style={[styles.buttonText, { color: secondary ? colors.foreground : colors.primaryForeground }]}>{label}</Text>{icon ? <Feather name={icon as never} size={17} color={secondary ? colors.foreground : colors.primaryForeground} /> : null}</Pressable>;
}

export function EmptyState({ title, body, icon = 'flag', action, onAction }: { title: string; body: string; icon?: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.emptyHeading}><View style={[styles.emptyIcon, { backgroundColor: `${colors.cyan}20` }]}><Feather name={icon as never} size={17} color={colors.cyan} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text></View><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.emptyAction}><Text style={[styles.actionText, { color: colors.cyan }]}>{action}</Text><Feather name="arrow-right" size={15} color={colors.cyan} /></Pressable> : null}</View>;
}

export function LoadingState() {
  const colors = useColors();
  return <View style={{ gap: 12, marginTop: 18 }}>{[1, 2].map(i => <View key={i} style={[styles.skeleton, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.skeletonImage, { backgroundColor: colors.secondary }]} /><View style={{ flex: 1, gap: 10 }}><View style={[styles.skeletonBar, { width: '70%', backgroundColor: colors.secondary }]} /><View style={[styles.skeletonBar, { width: '45%', backgroundColor: colors.secondary }]} /></View></View>)}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 20, paddingTop: 8 },
  header: { minHeight: 68, paddingHorizontal: 0, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 15, letterSpacing: 2.2, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerSubtitle: { fontSize: 12, letterSpacing: 0.4, flexShrink: 1, maxWidth: 120, textAlign: 'right' },
  menuButton: { height: 42, width: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4 },
  menuLine: { height: 1.5, width: 17, borderRadius: 1 },
  headerIcon: { width: 42, height: 42, justifyContent: 'center' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', flexDirection: 'row', justifyContent: 'flex-end' },
  drawer: { width: '86%', maxWidth: 370, height: '100%' },
  drawerContent: { flexGrow: 1, paddingHorizontal: 24 },
  drawerSpacer: { flexGrow: 1, minHeight: 24 },
  drawerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 18 },
  closeButton: { padding: 8 },
  drawerTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  drawerProfile: { borderBottomWidth: 1, borderTopWidth: 1, marginTop: 25, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 25 },
  avatarText: { fontSize: 16, fontWeight: '700' },
  drawerName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  small: { fontSize: 11 },
  drawerItem: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 5 },
  drawerItemText: { flex: 1, fontSize: 15, fontWeight: '500' },
  drawerFoot: { borderTopWidth: 1, paddingTop: 16, flexDirection: 'row' },
  signOutButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  signOutText: { fontSize: 13, fontWeight: '700' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 26, marginBottom: 14 },
  sectionTitle: { fontSize: 21, fontWeight: '800', marginTop: 2 },
  actionText: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  matchCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', marginBottom: 16 },
  gallery: { height: 280, overflow: 'hidden' },
  matchPhoto: { height: 280, justifyContent: 'space-between', padding: 16 },
  galleryDots: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  galleryDotHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  galleryDot: { width: 7, height: 7, borderRadius: 4 },
  matchBody: { flex: 1 },
  ageGroupPill: { minHeight: 25, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden', fontSize: 10, letterSpacing: .25, fontWeight: '800' },
  photoShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,8,0.25)' },
  photoPills: { flexDirection: 'row', justifyContent: 'space-between' },
  photoPill: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, overflow: 'hidden' },
  spotsPill: { fontSize: 9, fontWeight: '700', letterSpacing: 0.7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, overflow: 'hidden' },
  photoVenue: { gap: 3 },
  venueName: { fontSize: 20, fontWeight: '800' },
  venueLocation: { fontSize: 12, letterSpacing: 0.1 },
  matchInfo: { paddingHorizontal: 16, paddingVertical: 14 },
  matchTitleLocation: { gap: 4, marginBottom: 13 },
  cardLocation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 6 },
  pitchRating: { minHeight: 28, borderRadius: 9, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pitchRatingText: { fontSize: 10, fontWeight: '700' },
  refereeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '70%' },
  refereePhoto: { width: 24, height: 24, borderRadius: 12 },
  refereeText: { fontSize: 10, fontWeight: '600', flexShrink: 1 },
  matchInfoRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchFacts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { fontSize: 12, fontWeight: '600' },
  factDot: { width: 3, height: 3, borderRadius: 3, marginHorizontal: 1 },
  priceBlock: { alignItems: 'flex-end', gap: 1 },
  priceValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceCaption: { fontSize: 10, letterSpacing: 0.35, fontWeight: '700' },
  oldPrice: { fontSize: 10, textDecorationLine: 'line-through' },
  price: { fontSize: 16, fontWeight: '700' },
  perksRow: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perkText: { fontSize: 11 },
  fieldLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  inputWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  passwordToggle: { position: 'absolute', right: 4, width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 54, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  emptyState: { padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'stretch', marginTop: 10, overflow: 'hidden' },
  emptyHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  emptyIcon: { width: 34, height: 34, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '800' },
  emptyBody: { fontSize: 13, lineHeight: 19 },
  emptyAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  skeleton: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: 'row', gap: 14, height: 112, alignItems: 'center' },
  skeletonImage: { width: 88, height: 84, borderRadius: 12 },
  skeletonBar: { height: 10, borderRadius: 6 },
  googleButton: { height: 48, borderWidth: 1, borderColor: '#DADCE0', borderRadius: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF' },
  googleLogo: { position: 'absolute', left: 16 },
  googleText: { color: '#3C4043', textAlign: 'center', fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  googleError: { fontSize: 11, lineHeight: 16, marginTop: 9 },
});



