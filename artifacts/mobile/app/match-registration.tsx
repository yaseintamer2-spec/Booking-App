import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { getGetCurrentUserQueryKey, getGetMatchQueryKey, useGetCurrentUser, useGetMatch } from '@workspace/api-client-react';
import { useAuth, useUser } from '@clerk/expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { NotificationsButton } from '@/components/NotificationsButton';
import { LiveScoreboard, type LiveView } from '@/components/LiveScoreboard';
import { apiBaseUrl } from '@/lib/apiBaseUrl';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { useColors } from '@/hooks/useColors';
import { IconBadge, type AccentTone } from '@/components/IconBadge';
import { isLocalPreviewMode } from '@/lib/localPreview';
import {
  matchRegistrationMock,
  loadSampleParticipants,
  mockJoinMatch,
  saveSampleParticipants,
  type PositionPreference,
  type RegistrationMatch,
  type RegistrationParticipant,
} from '@/data/matchRegistrationMock';

const SHOW_PREVIEW_NOTICE = !isLocalPreviewMode;
const PREVIEW_COPY =
  "For illustrative purposes only. This isn't the final result: the match shown is a sample, and the design and prices may change.";
const POSITION_OPTIONS: { label: string; value: PositionPreference }[] = [
  { label: 'Anywhere', value: 'anywhere' },
  { label: 'Goalkeeper', value: 'goalkeeper' },
  { label: 'Defender', value: 'defender' },
  { label: 'Midfielder', value: 'midfielder' },
  { label: 'Attacker', value: 'attacker' },
];
const POSITION_TONES: Record<PositionPreference, AccentTone> = { anywhere: 'primary', goalkeeper: 'yellow', defender: 'cyan', midfielder: 'violet', attacker: 'pink' };
const POSITION_ICONS: Record<PositionPreference, React.ComponentProps<typeof Feather>['name']> = { anywhere: 'move', goalkeeper: 'shield', defender: 'shield', midfielder: 'activity', attacker: 'target' };
const DEFAULT_PITCH_PHOTOS: (string | number)[] = [
  require('../assets/images/football-match-card.jpg'),
  require('../assets/images/home-pitch-hero.jpg'),
  require('../assets/images/home-stadium-sunset.png'),
];
const PITCH_HEIGHT = 700;
const SLOT_HEIGHT = 68;
const FORMATION_ROWS: [number, number[]][] = [
  [14, [50]],
  [100, [36, 64]],
  [186, [18, 50, 82]],
  [272, [50]],
];
const PITCH_SLOTS = [0, 1].flatMap((half) =>
  FORMATION_ROWS.flatMap(([y, columns]) =>
    columns.map((x) => ({
      half,
      x,
      y: half ? PITCH_HEIGHT - (y + SLOT_HEIGHT) : y,
    })),
  ),
);

type Palette = ReturnType<typeof useColors> & {
  amber: string; blue: string; red: string; pitch: string; pitchDark: string; pitchOutline: string;
};
type ConfirmationTicket = {
  id: string;
  firstName: string;
  pitchSlot: number;
  value: string;
  expiresAt: string;
};
type RegistrationTicket = {
  id: string;
  userId: string;
  firstName: string;
  avatarUrl: string | null;
  pitchSlot: number;
  checkInToken: string;
  expiresAt: string;
};

function pitchPhotoSource(photo: string | number | null) {
  if (typeof photo === 'number') return photo;
  if (photo === 'local:football-match-card') return require('../assets/images/football-match-card.jpg');
  if (photo === 'local:home-pitch-hero') return require('../assets/images/home-pitch-hero.jpg');
  if (photo === 'local:home-stadium-sunset') return require('../assets/images/home-stadium-sunset.png');
  return photo ? { uri: photo } : require('../assets/images/football-match-card.jpg');
}

export default function MatchRegistrationScreen() {
  const colors: Palette = {
    ...useColors(),
    amber: '#FFD84D', blue: '#35D8FF', red: '#FF4FA8',
    pitch: '#2FA260', pitchDark: '#278B52', pitchOutline: '#B7FFD8',
  };
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: routeId, view: routeView } = useLocalSearchParams<{ id?: string; view?: string }>();
  const liveMatchId = Array.isArray(routeId) ? routeId[0] : routeId;
  const localSampleMatch = isLocalPreviewMode && liveMatchId === matchRegistrationMock.match.id;
  const readOnly = routeView === 'played';
  const { getToken, userId } = useAuth();
  const { user: clerkUser } = useUser();
  const remoteMatch = useGetMatch(liveMatchId || '', { query: { queryKey: getGetMatchQueryKey(liveMatchId || ''), enabled: !!liveMatchId && !localSampleMatch } });
  const account = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), enabled: !isLocalPreviewMode, retry: false } });
  const match = remoteMatch.data ? {
    ...matchRegistrationMock.match,
    id: remoteMatch.data.id,
    pitchName: remoteMatch.data.venueName,
    area: remoteMatch.data.neighborhood,
    address: remoteMatch.data.address,
    imageUrl: remoteMatch.data.imageUrl,
    imageUrls: remoteMatch.data.imageUrls,
    startsAt: remoteMatch.data.startsAt,
    durationHours: remoteMatch.data.durationMinutes / 60,
    maxPlayers: remoteMatch.data.capacity,
    ageGroup: remoteMatch.data.ageGroup,
    pricePerPlayer: remoteMatch.data.priceHalalas / 100,
    pitchRatingAverage: remoteMatch.data.pitchRatingAverage,
    pitchRatingCount: remoteMatch.data.pitchRatingCount,
    refereeName: remoteMatch.data.refereeName,
    refereeAvatarUrl: remoteMatch.data.refereeAvatarUrl,
    status: remoteMatch.data.status === 'cancelled' ? 'cancelled' as const : remoteMatch.data.bookedCount >= remoteMatch.data.capacity ? 'full' as const : 'open' as const,
  } : matchRegistrationMock.match;
  const matchPhotoList = match.imageUrls?.filter((url) => typeof url === 'number' || (typeof url === 'string' && (/^https:\/\//i.test(url) || /^data:image\//i.test(url)))).slice(0, 3) || [];
  const legacyPitchPhoto = match.imageUrl && (/^https:\/\//i.test(match.imageUrl) || /^data:image\//i.test(match.imageUrl)) ? match.imageUrl : null;
  // Older matches without stored photos still receive a bundled gallery.
  const pitchPhotos: (string | number)[] = matchPhotoList.length ? matchPhotoList : legacyPitchPhoto ? [legacyPitchPhoto] : DEFAULT_PITCH_PHOTOS;
  const currentUser = account.data ? {
    userId: account.data.id,
    firstName: account.data.name.split(' ')[0],
    avatarUrl: clerkUser?.imageUrl ?? null,
  } : clerkUser ? {
    userId: userId || clerkUser.id,
    firstName: clerkUser.firstName || clerkUser.fullName?.split(' ')[0] || 'Player',
    avatarUrl: clerkUser.imageUrl || null,
  } : matchRegistrationMock.currentUser;
  const [noticeVisible, setNoticeVisible] = useState(SHOW_PREVIEW_NOTICE);
  const [activePitchPhoto, setActivePitchPhoto] = useState(0);
  const [failedPitchPhotos, setFailedPitchPhotos] = useState<Record<number, boolean>>({});
  const [pitchPhotoWidth, setPitchPhotoWidth] = useState(320);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const pitchPhotoScroll = useRef<ScrollViewInstance | null>(null);
  useEffect(() => {
    setActivePitchPhoto(0);
    setFailedPitchPhotos({});
    pitchPhotoScroll.current?.scrollTo({ x: 0, animated: false });
  }, [match.id]);
  useEffect(() => {
    if (pitchPhotos.length < 2 || photoViewerOpen) return;
    const timer = setInterval(() => setActivePitchPhoto((current) => {
      const next = (current + 1) % pitchPhotos.length;
      pitchPhotoScroll.current?.scrollTo({ x: next * pitchPhotoWidth, animated: true });
      return next;
    }), 5000);
    return () => clearInterval(timer);
  }, [pitchPhotos.length, pitchPhotoWidth, photoViewerOpen]);
  const [participants, setParticipants] = useState(
    matchRegistrationMock.participants,
  );
  useFocusEffect(useCallback(() => {
    if (liveMatchId && !localSampleMatch) return;
    let active = true;
    void loadSampleParticipants().then((rows) => {
      if (!active) return;
      const refreshed = rows.map((participant) => participant.userId === currentUser.userId
        ? { ...participant, avatarUrl: currentUser.avatarUrl }
        : participant);
      setParticipants(refreshed);
      void saveSampleParticipants(refreshed);
      const mine = refreshed.find((participant) => participant.userId === currentUser.userId);
      setJoined(Boolean(mine));
      setSelectedPitchSlots(mine?.pitchSlot == null ? [] : [mine.pitchSlot]);
    });
    return () => { active = false; };
  }, [liveMatchId, localSampleMatch, currentUser.userId, currentUser.avatarUrl]));
  const [joinError, setJoinError] = useState<string | null>(null);
  const [positionPreference, setPositionPreference] =
    useState<PositionPreference>('anywhere');
  const [friendEmails, setFriendEmails] = useState<string[]>([]);
  const [friendOnlyBooking, setFriendOnlyBooking] = useState(false);
  const [selectedPitchSlots, setSelectedPitchSlots] = useState<number[]>([]);
  const [confirmationTickets, setConfirmationTickets] = useState<ConfirmationTicket[]>([]);
  const [joining, setJoining] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [joined, setJoined] = useState(false);
  const joinLock = useRef(false);
  const [focusedPosition, setFocusedPosition] =
    useState<PositionPreference | null>(null);
  const [joinButtonFocused, setJoinButtonFocused] = useState(false);
  const [liveSnapshot, setLiveSnapshot] = useState<LiveView | null>(null);
  const [profileParticipant, setProfileParticipant] = useState<RegistrationParticipant | null>(null);
  const [profileStats, setProfileStats] = useState<{ firstName: string; avatarUrl: string | null; matchesPlayed: number; wins: number; draws: number; losses: number; goals: number; assists: number; yellowCards: number; redCards: number; fairPlayScore: number | null } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (localSampleMatch) {
      setProfileStats(null);
      setProfileError('Player stats are not available in the local match preview.');
      setProfileLoading(false);
      return;
    }
    if (!profileParticipant) return;
    let active = true;
    setProfileStats(null); setProfileError(''); setProfileLoading(true);
    fetchWithTimeout(`${apiBaseUrl}/api/players/${encodeURIComponent(profileParticipant.userId)}/profile`, {}, 8_000)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Player stats are not available yet.')))
      .then(data => { if (active) setProfileStats(data); })
      .catch(error => { if (active) setProfileError(error instanceof Error ? error.message : 'Could not load player stats.'); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [profileParticipant, localSampleMatch]);

  useFocusEffect(useCallback(() => {
    if (!liveMatchId || localSampleMatch) return;
    let active = true;
    fetchWithTimeout(`${apiBaseUrl}/api/matches/${liveMatchId}/participants`, {}, 8_000)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load players.')))
      .then((rows: RegistrationParticipant[]) => {
        if (!active) return;
        setParticipants(rows);
        const currentRegistration = rows.find((player) => player.userId === currentUser.userId);
        setJoined(Boolean(currentRegistration));
        setSelectedPitchSlots(currentRegistration?.pitchSlot == null ? [] : [currentRegistration.pitchSlot]);
      })
      .catch(() => { if (active) setJoinError('Could not load the live player list. Please try again.'); });
    return () => { active = false; };
  }, [liveMatchId, localSampleMatch, currentUser.userId]));
  useEffect(() => {
    setParticipants((current) => current.map((participant) => participant.userId === currentUser.userId
        ? { ...participant, avatarUrl: currentUser.avatarUrl }
        : participant));
  }, [currentUser.avatarUrl, currentUser.userId, liveMatchId]);
  const joinedCount = participants.length;
  const isFull = joinedCount >= match.maxPlayers || match.status === 'full';
  const isCancelled = match.status === 'cancelled';
  const spotsRemaining = Math.max(0, match.maxPlayers - joinedCount);
  const goalkeeperCount = participants.filter(
    (participant) => participant.positionPreference === 'goalkeeper',
  ).length;
  const goalkeeperLimitReached = goalkeeperCount >= match.maxGoalkeepers;
  const friendLimit = friendOnlyBooking
    ? Math.min(1, spotsRemaining)
    : Math.min(13, Math.max(0, Math.min(match.maxPlayers, spotsRemaining) - 1));
  const expectedTicketCount = friendEmails.length + (friendOnlyBooking ? 0 : 1);
  const hasAllSelectedPitchSlots = selectedPitchSlots.length === expectedTicketCount;

  const beginFriendBooking = () => {
    if (!joined || isFull || !liveMatchId) return;
    setFriendOnlyBooking(true);
    setFriendEmails(['']);
    setSelectedPitchSlots([]);
    setJoinError(null);
  };
  const cancelFriendBooking = () => {
    setFriendOnlyBooking(false);
    setFriendEmails([]);
    setSelectedPitchSlots([]);
    setJoinError(null);
  };

  const addFriend = () => {
    if (!liveMatchId || friendEmails.length >= friendLimit) return;
    setFriendEmails((current) => [...current, '']);
    setJoinError(null);
  };
  const removeFriend = (index: number) => {
    const updatedEmails = friendEmails.filter((_, emailIndex) => emailIndex !== index);
    setFriendEmails(updatedEmails);
    setSelectedPitchSlots((current) => current.slice(0, updatedEmails.length + 1));
    setJoinError(null);
  };
  const selectPitchSpot = (slot: number) => {
    setJoinError(null);
    if (selectedPitchSlots.includes(slot)) {
      setSelectedPitchSlots((current) => current.filter((selected) => selected !== slot));
    } else if (selectedPitchSlots.length >= expectedTicketCount) {
      setJoinError('You have one spot selected per ticket. Tap a selected spot to change it.');
    } else {
      setSelectedPitchSlots((current) => [...current, slot]);
    }
  };

  const joinMatch = async () => {
    if (joinLock.current || joining || (joined && !friendOnlyBooking) || isFull || isCancelled) return;
    const normalizedFriendEmails = friendEmails.map((email) => email.trim());
    if (normalizedFriendEmails.some((email) => !email)) {
      setJoinError('Enter an email for each friend, or remove the empty friend row.');
      return;
    }
    if (new Set(normalizedFriendEmails.map((email) => email.toLowerCase())).size !== normalizedFriendEmails.length) {
      setJoinError('Use a different email for each friend.');
      return;
    }
    if (selectedPitchSlots.length !== normalizedFriendEmails.length + (friendOnlyBooking ? 0 : 1)) {
      setJoinError(friendOnlyBooking ? 'Choose one open pitch spot for your friend.' : 'Choose one open pitch spot for each ticket.');
      return;
    }
    joinLock.current = true;
    setJoinError(null);
    setJoining(true);
    try {
      if (liveMatchId && !localSampleMatch) {
        const token = await getToken();
        const response = await fetch(`${apiBaseUrl}/api/matches/${liveMatchId}/registrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ positionPreference, friendEmails: normalizedFriendEmails, pitchSlots: selectedPitchSlots, friendOnly: friendOnlyBooking }),
        });
        const payload = await response.json() as { error?: string; tickets?: unknown };
        if (!response.ok) throw new Error(payload.error || 'Could not join this match.');
        const ticketRows = Array.isArray(payload.tickets) ? payload.tickets.filter(isRegistrationTicket) : [];
        const qrTickets = ticketRows
          .map((ticket) => ({
            id: ticket.id,
            firstName: ticket.firstName || 'Player',
            pitchSlot: ticket.pitchSlot,
            value: `kickoff://check-in?matchId=${encodeURIComponent(liveMatchId)}&token=${encodeURIComponent(ticket.checkInToken)}`,
            expiresAt: ticket.expiresAt,
          }));
        setParticipants((current) => {
          const registeredUserIds = new Set(ticketRows.map((ticket) => ticket.userId));
          const additions = ticketRows.map((ticket, index) => ({
            userId: ticket.userId,
            firstName: ticket.firstName || 'Player',
            avatarUrl: ticket.avatarUrl || null,
            pitchSlot: ticket.pitchSlot,
            positionPreference: !friendOnlyBooking && index === 0 ? positionPreference : 'anywhere' as const,
          }));
          return [...current.filter((participant) => !registeredUserIds.has(participant.userId)), ...additions];
        });
        if (qrTickets.length === normalizedFriendEmails.length + (friendOnlyBooking ? 0 : 1)) {
          setConfirmationTickets(qrTickets);
        } else {
          setJoinError('Your places are confirmed, but the QR codes could not be displayed. Reopen them from My Matches.');
        }
      } else {
        await mockJoinMatch(match.id, positionPreference);
        const friendRows = normalizedFriendEmails.map((email, index) => {
          const localPart = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
          const firstName = localPart.split(/\s+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || `Friend ${index + 1}`;
          return { userId: `sample-friend-${email.toLowerCase()}`, firstName, avatarUrl: null, pitchSlot: selectedPitchSlots[index + (friendOnlyBooking ? 0 : 1)], positionPreference: 'anywhere' as const };
        });
        const localAttendees = friendOnlyBooking ? friendRows : [
          { userId: currentUser.userId, firstName: currentUser.firstName, avatarUrl: currentUser.avatarUrl, pitchSlot: selectedPitchSlots[0], positionPreference },
          ...friendRows,
        ];
        const existingSamples = await loadSampleParticipants();
        const existingIds = new Set(existingSamples.map((participant) => participant.userId));
        const alreadyBooked = localAttendees.find((participant) => existingIds.has(participant.userId));
        if (alreadyBooked) throw new Error(`${alreadyBooked.firstName} already has a place in this match.`);
        const additions = localAttendees.filter((participant) => !existingIds.has(participant.userId));
        const updated = [...existingSamples, ...additions];
        setParticipants(updated);
        await saveSampleParticipants(updated);
        const expiresAt = new Date(new Date(match.startsAt).getTime() + match.durationHours * 60 * 60_000).toISOString();
        setConfirmationTickets(localAttendees.map((attendee, index) => ({
          id: `sample-${attendee.userId}`,
          firstName: attendee.firstName,
          pitchSlot: attendee.pitchSlot,
          value: `kickoff://sample-check-in?matchId=${encodeURIComponent(match.id)}&userId=${encodeURIComponent(attendee.userId)}`,
          expiresAt,
        })));
      }
      setJoined(true);
      if (friendOnlyBooking) cancelFriendBooking();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join this match. Please try again.');
    } finally {
      joinLock.current = false;
      setJoining(false);
    }
  };

  const joinWaitlist = async () => {
    if (!liveMatchId || joining || waitlisted || isCancelled) return;
    if (localSampleMatch) { setWaitlisted(true); setJoinError('You’re on the local preview waitlist. No notification will be sent.'); return; }
    setJoinError(null); setJoining(true);
    try {
      const token = await getToken(); const apiBase = apiBaseUrl;
      const response = await fetch(`${apiBase}/api/matches/${liveMatchId}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ positionPreference }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Could not join the waitlist.');
      setWaitlisted(true); setJoinError(`You're #${payload.position} on the waitlist. We'll notify you when a place opens.`);
    } catch (error) { setJoinError(error instanceof Error ? error.message : 'Could not join the waitlist.'); }
    finally { setJoining(false); }
  };

  const dateTitle = formatMatchDate(match.startsAt);
  const joinLabel = getJoinLabel({
    joining,
    joined: joined && !friendOnlyBooking,
    isFull,
    isCancelled,
    hasSelectedPitchSlot: hasAllSelectedPitchSlots,
    requiredPitchSlots: expectedTicketCount,
  });
  const joinDisabled =
    joining ||
    (joined && !friendOnlyBooking) ||
    isFull ||
    isCancelled ||
    !hasAllSelectedPitchSlots;
  const selectedSpotSummary = selectedPitchSlots.map((slot, index) =>
    `${index === 0 ? 'You' : friendEmails[index - 1]?.trim() || `Friend ${index}`} · spot ${slot + 1}`,
  ).join('  |  ');

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <View
            style={[
              styles.header,
              { paddingTop: Math.max(insets.top, 8) + 8 },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/matches'); }}
              style={styles.headerBack}
            >
              <Feather name="arrow-left" size={21} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              {readOnly ? 'MATCH DETAILS' : 'MATCH REGISTRATION'}
            </Text>
            <NotificationsButton />
          </View>
          {noticeVisible && !readOnly ? (
            <PreviewNotice
              colors={colors}
              onDismiss={() => setNoticeVisible(false)}
            />
          ) : null}
          <View style={[styles.registrationLocationCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View
              style={[styles.registrationHero, { backgroundColor: colors.card }]}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0) setPitchPhotoWidth(width);
              }}
            >
              <ScrollView
                ref={pitchPhotoScroll}
                style={styles.registrationHeroScroller}
                contentContainerStyle={styles.registrationHeroSlides}
                horizontal
                pagingEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  if (pitchPhotoWidth > 0) {
                    setActivePitchPhoto(Math.max(0, Math.min(pitchPhotos.length - 1, Math.round(event.nativeEvent.contentOffset.x / pitchPhotoWidth))));
                  }
                }}
              >
                {pitchPhotos.map((photo, index) => (
                  <Pressable
                    key={`${match.id}-hero-photo-${index}`}
                    style={[styles.registrationHeroSlide, { width: pitchPhotoWidth }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open pitch photo ${index + 1} of ${pitchPhotos.length} full size`}
                    onPress={() => { setActivePitchPhoto(index); setPhotoViewerOpen(true); }}
                  >
                    <Image
                      source={failedPitchPhotos[index] ? require('../assets/images/football-match-card.jpg') : pitchPhotoSource(photo)}
                      resizeMode="cover"
                      style={[styles.registrationHeroSlideImage, { width: pitchPhotoWidth }]}
                      onError={() => setFailedPitchPhotos((current) => ({ ...current, [index]: true }))}
                      accessibilityLabel={`${match.pitchName} pitch photo ${index + 1} of ${pitchPhotos.length}`}
                    />
                  </Pressable>
                ))}
              </ScrollView>
              <View pointerEvents="none" style={styles.registrationHeroOverlay}>
                <LinearGradient
                  colors={['rgba(5,17,26,0.08)', 'rgba(5,17,26,0.3)', 'rgba(5,17,26,0.88)']}
                  locations={[0, 0.48, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.registrationHeroCopy}>
                  <Text style={[styles.matchKicker, { color: colors.primary }]}>
                    {`7x7 · ${match.durationHours} HOURS · REFEREE INCLUDED`}
                  </Text>
                  <Text style={[styles.matchTitle, { color: colors.foreground }]}>{dateTitle}</Text>
                  <Text style={[styles.matchSubtitle, { color: colors.foreground }]}>{match.pitchName}</Text>
                </View>
              </View>
              {pitchPhotos.length > 1 ? <View style={styles.registrationHeroDots}>{pitchPhotos.map((_, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Show pitch photo ${index + 1} of ${pitchPhotos.length}`} onPress={() => { setActivePitchPhoto(index); pitchPhotoScroll.current?.scrollTo({ x: index * pitchPhotoWidth, animated: true }); }} style={styles.registrationGalleryDotHit}><View style={[styles.registrationGalleryDot, { backgroundColor: index === activePitchPhoto ? colors.googleBlue : 'rgba(232,238,233,.9)' }]} /></Pressable>)}</View> : null}
            </View>
            <View style={styles.locationSummary}>
              <View style={styles.locationSummaryCopy}>
                <View style={styles.locationNameRow}><Feather name="map-pin" size={15} color={colors.primary} /><Text numberOfLines={1} style={[styles.locationName, { color: colors.foreground }]}>{match.area}</Text></View>
                <Text numberOfLines={2} style={[styles.locationAddress, { color: colors.mutedForeground }]}>{/^https?:\/\//i.test(match.address || '') ? 'Tap below to open the pitch pin in Google Maps.' : match.address || match.area}</Text>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${match.pitchName} in Google Maps`}
                  onPress={() => {
                    const destination = /^https?:\/\//i.test(match.address || '')
                      ? match.address || ''
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${match.pitchName}, ${match.address || match.area}, Riyadh`)}`;
                    void Linking.openURL(destination);
                  }}
                  style={styles.mapsLink}
                >
                  <Text style={[styles.mapsLinkText, { color: colors.primary }]}>Open in Google Maps</Text>
                  <Feather name="arrow-up-right" size={13} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          </View>
          <View accessibilityRole="alert" style={[styles.agePolicy, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="shield" size={16} color={colors.primary} /><Text style={[styles.agePolicyText, { color: colors.mutedForeground }]}>Age group: <Text style={{ color: colors.foreground, fontWeight: '800' }}>{match.ageGroup.replace('-', '–')}</Text>. The referee checks age at the venue and may refuse entry if you do not meet this group, even if you have paid.</Text></View>
          <View style={[styles.matchTrust, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.trustRating, { backgroundColor: colors.secondary }]}><Feather name="star" size={15} color={colors.amber} /><View><Text accessibilityLabel={match.pitchRatingAverage == null ? 'Pitch rating: no reviews yet' : `Pitch rating ${match.pitchRatingAverage.toFixed(1)} out of 5 from ${match.pitchRatingCount || 0} reviews`} style={[styles.trustValue, { color: colors.foreground }]}>{match.pitchRatingAverage == null ? 'New pitch' : `${match.pitchRatingAverage.toFixed(1)} / 5`}</Text><Text style={[styles.trustCaption, { color: colors.mutedForeground }]}>{match.pitchRatingCount ? `${match.pitchRatingCount} player ratings` : 'No player ratings yet'}</Text></View></View>
            {match.refereeName ? <View style={styles.assignedReferee}>{match.refereeAvatarUrl ? <Image accessibilityLabel={`${match.refereeName}, assigned referee`} source={{ uri: match.refereeAvatarUrl }} style={styles.assignedRefereePhoto} /> : <View style={[styles.assignedRefereePhoto, styles.assignedRefereeFallback, { backgroundColor: colors.secondary }]}><Feather name="user" size={15} color={colors.mutedForeground} /></View>}<View style={{ flexShrink: 1 }}><Text style={[styles.trustCaption, { color: colors.mutedForeground }]}>REFEREE</Text><Text numberOfLines={1} style={[styles.trustValue, { color: colors.foreground }]}>{match.refereeName}</Text></View></View> : <View style={styles.assignedReferee}><Feather name="shield" size={17} color={colors.mutedForeground} /><Text style={[styles.trustCaption, { color: colors.mutedForeground }]}>Referee not assigned yet</Text></View>}
          </View>
          {liveMatchId || isLocalPreviewMode ? <LiveScoreboard matchId={liveMatchId || match.id} showAllEvents={readOnly} onSnapshot={setLiveSnapshot} /> : null}

          {liveMatchId && !readOnly ? <>
            {joined && !friendOnlyBooking ? <>
              <SectionLabel colors={colors}>BOOK FOR A FRIEND</SectionLabel>
              <Text style={[styles.preferenceNote, { color: colors.mutedForeground }]}>Your place is confirmed. You can book one additional friend at a time; they need a KICKOFF account with a verified email.</Text>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: isFull }} disabled={isFull || isCancelled} onPress={beginFriendBooking} style={[styles.addFriendButton, { borderColor: colors.border, opacity: isFull || isCancelled ? 0.5 : 1 }]}>
                <Feather name="user-plus" size={15} color={colors.primary} />
                <Text style={[styles.addFriendText, { color: colors.primary }]}>{isFull ? 'No places left for a friend' : 'Book another friend'}</Text>
              </Pressable>
            </> : null}
            {(!joined || friendOnlyBooking) ? <>
            <SectionLabel colors={colors}>{friendOnlyBooking ? 'FRIEND DETAILS' : 'BOOK FOR FRIENDS'}</SectionLabel>
            <Text style={[styles.preferenceNote, { color: colors.mutedForeground }]}>
              {friendOnlyBooking ? 'Enter one friend’s verified KICKOFF account email. They get their own ticket and check-in QR.' : 'Friends need a KICKOFF account with a verified email. Each person gets their own ticket and QR code.'}
            </Text>
            {friendEmails.map((email, index) => (
              <View key={`friend-${index}`} style={[styles.friendRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <TextInput
                  accessibilityLabel={`Friend ${index + 1} verified account email`}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="friend@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  value={email}
                  onChangeText={(value) => setFriendEmails((current) => current.map((entry, emailIndex) => emailIndex === index ? value : entry))}
                  style={[styles.friendInput, { color: colors.foreground }]}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove friend ${index + 1}`} onPress={() => removeFriend(index)} style={styles.removeFriend}>
                  <Feather name="x" size={17} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: friendEmails.length >= friendLimit || joining || friendOnlyBooking }}
              disabled={friendEmails.length >= friendLimit || joining || friendOnlyBooking}
              onPress={addFriend}
              style={[styles.addFriendButton, { borderColor: colors.border, opacity: friendEmails.length >= friendLimit || joining ? 0.5 : 1 }]}
            >
              <Feather name="user-plus" size={15} color={colors.primary} />
              <Text style={[styles.addFriendText, { color: colors.primary }]}>{friendOnlyBooking ? 'One friend per additional booking' : 'Add a friend'}</Text>
            </Pressable>
            {friendOnlyBooking ? <Pressable accessibilityRole="button" onPress={cancelFriendBooking} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: colors.mutedForeground, fontSize: 12, fontWeight: '700' }}>Cancel friend booking</Text></Pressable> : null}
            </> : null}
          </> : null}

          <SectionLabel colors={colors}>PLAYERS</SectionLabel>
          <Pitch
            participants={participants}
            colors={colors}
            maxPlayers={match.maxPlayers}
            selectedPitchSlots={selectedPitchSlots}
            goalsByUser={Object.fromEntries((liveSnapshot?.events || []).filter(event => event.type === 'goal').reduce((counts, event) => counts.set(event.scorerUserId, (counts.get(event.scorerUserId) || 0) + 1), new Map<string, number>()))}
            onOpenProfile={setProfileParticipant}
            onSelectSpot={selectPitchSpot}
            disabled={readOnly || joining || (joined && !friendOnlyBooking) || isFull || isCancelled}
          />
          {!readOnly ? <Text style={[styles.preferenceNote, { color: colors.mutedForeground }]}>
            {joined && !friendOnlyBooking
              ? `Your spot is confirmed. You can book one friend at a time above.`
              : friendOnlyBooking && !selectedPitchSlots.length
              ? 'Tap one open + spot for your friend; the booking is not confirmed until you continue.'
              : friendOnlyBooking
              ? `Friend spot selected: ${selectedSpotSummary}.`
              : !selectedPitchSlots.length
              ? `Tap open + spots to choose ${expectedTicketCount} spot${expectedTicketCount === 1 ? '' : 's'}; they are not confirmed until you join.`
              : `Selected: ${selectedSpotSummary}. Tap an open or selected spot to adjust.`}
          </Text> : null}

          {!readOnly ? <><SectionLabel colors={colors}>YOUR POSITION</SectionLabel>
          <Text style={[styles.preferenceNote, { color: colors.mutedForeground }]}>
            Position preference is for team balancing; your selected pitch spot is saved separately.
          </Text>
          <View style={styles.positionOptions}>
            {POSITION_OPTIONS.map((option) => {
              const selected = positionPreference === option.value;
              const disabled =
                option.value === 'goalkeeper' &&
                goalkeeperLimitReached &&
                !selected;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onFocus={() => setFocusedPosition(option.value)}
                  onBlur={() => setFocusedPosition(null)}
                  onPress={() => setPositionPreference(option.value)}
                  style={({ pressed }) => [
                    styles.positionPill,
                    {
                      backgroundColor: selected ? `${colors[POSITION_TONES[option.value]]}20` : colors.card,
                      borderColor: focusedPosition === option.value ? colors.foreground : selected ? colors[POSITION_TONES[option.value]] : colors.border,
                      opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
                      borderWidth: focusedPosition === option.value ? 2 : 1,
                    },
                  ]}
                >
                  <IconBadge name={POSITION_ICONS[option.value]} tone={POSITION_TONES[option.value]} size="small" />
                  <Text
                    style={[
                      styles.positionLabel,
                      {
                        color: selected
                          ? colors[POSITION_TONES[option.value]]
                          : colors.foreground,
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {goalkeeperLimitReached ? (
            <Text style={[styles.goalkeeperNote, { color: colors.mutedForeground }]}>
              The match already has the maximum of {match.maxGoalkeepers} goalkeepers.
            </Text>
          ) : null}

          <ProgressArea
            joinedCount={joinedCount}
            match={match}
            spotsRemaining={spotsRemaining}
            colors={colors}
          />
          </> : null}
        </View>
      </ScrollView>

      {!readOnly ? <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        <View style={styles.footerContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: joined && !friendOnlyBooking ? joining || isFull || isCancelled : joinDisabled,
              busy: joining,
            }}
            disabled={joined && !friendOnlyBooking ? joining || isFull || isCancelled : joinDisabled}
            onFocus={() => setJoinButtonFocused(true)}
            onBlur={() => setJoinButtonFocused(false)}
            onPress={joined && !friendOnlyBooking ? beginFriendBooking : joinMatch}
            style={({ pressed }) => [
              styles.joinButton,
              {
                backgroundColor: colors.primary,
                opacity: joinDisabled ? 0.48 : pressed ? 0.82 : 1,
                borderWidth: joinButtonFocused ? 2 : 0,
                borderColor: joinButtonFocused ? colors.foreground : 'transparent',
              },
            ]}
          >
            {joining ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : joined && !friendOnlyBooking ? (
              <Feather
                name="user-plus"
                size={17}
                color={colors.primaryForeground}
              />
            ) : null}
            <Text style={[styles.joinButtonText, { color: colors.primaryForeground }]}>
              {joined && !friendOnlyBooking ? isFull ? 'No friend places left' : 'Book another friend' : joinLabel}
            </Text>
          </Pressable>
          <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
            {liveMatchId
              ? friendOnlyBooking ? 'Payment is skipped during testing. Your friend gets their own ticket; no money is collected.' : 'Payment is skipped during testing. Your spot is confirmed; no money is collected.'
              : 'Sample booking · payment is skipped. Your local spot is confirmed.'}
          </Text>
          {isFull && liveMatchId && !joined ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: joining || waitlisted }} disabled={joining || waitlisted} onPress={joinWaitlist} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1, borderRadius: 14, borderColor: colors.border }}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{waitlisted ? 'You’re on the waitlist' : 'Join waitlist'}</Text></Pressable> : null}
          {joinError ? (
            <Text accessibilityRole="alert" style={[styles.joinError, { color: colors.destructive }]}>
              {joinError}
            </Text>
          ) : null}
        </View>
      </View> : null}
      <Modal transparent visible={photoViewerOpen} animationType="fade" onRequestClose={() => setPhotoViewerOpen(false)}>
        <View style={styles.photoViewer}>
          <Image
            source={pitchPhotoSource(pitchPhotos[activePitchPhoto] ?? null)}
            resizeMode="contain"
            accessibilityLabel={`${match.pitchName} pitch photo ${activePitchPhoto + 1} of ${pitchPhotos.length}`}
            style={styles.fullSizePhoto}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close full-size pitch photo"
            onPress={() => setPhotoViewerOpen(false)}
            style={[styles.photoViewerClose, { top: Math.max(insets.top, 14) + 8 }]}
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
      <Modal visible={confirmationTickets.length > 0} transparent animationType="fade" onRequestClose={() => setConfirmationTickets([])}>
        <View style={styles.ticketBackdrop}>
          <View style={[styles.ticketModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.ticketTitle, { color: colors.foreground }]}>You’re registered</Text>
            <Text style={[styles.ticketSubtitle, { color: colors.mutedForeground }]}>{liveMatchId ? 'No payment was collected. Your check-in QR codes are ready in My Matches.' : 'Your place is reserved in this preview. This QR is not connected to venue check-in.'}</Text>
            <ScrollView style={styles.ticketList} contentContainerStyle={styles.ticketListContent} showsVerticalScrollIndicator={false}>
              {confirmationTickets.map((ticket) => (
                <View key={ticket.id} style={[styles.ticketCard, { borderColor: colors.border }]}>
                  <Text style={[styles.ticketName, { color: colors.foreground }]}>{ticket.firstName} · Spot {ticket.pitchSlot + 1}</Text>
                  <View style={{ padding: 9, borderWidth: 5, borderColor: colors.primary, borderRadius: 19, backgroundColor: '#FFFFFF' }}><View style={{ padding: 8, backgroundColor: '#FFFFFF' }}><QRCode value={ticket.value} size={190} color="#07120A" backgroundColor="#FFFFFF" /></View></View>
                  <Text style={[styles.ticketExpiry, { color: colors.mutedForeground }]}>Valid until {new Date(ticket.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setConfirmationTickets([])} style={[styles.joinButton, { backgroundColor: colors.primary, marginTop: 10 }]}>
              <Text style={[styles.joinButtonText, { color: colors.primaryForeground }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <PlayerProfileModal participant={profileParticipant} stats={profileStats} loading={profileLoading} error={profileError} colors={colors} onClose={() => setProfileParticipant(null)} />
    </View>
  );
}

function PreviewNotice({
  colors,
  onDismiss,
}: {
  colors: Palette;
  onDismiss: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.previewNotice,
        { backgroundColor: 'rgba(245,196,81,0.09)', borderColor: 'rgba(245,196,81,0.4)' },
      ]}
    >
      <View style={styles.previewContent}>
        <View style={[styles.previewTag, { backgroundColor: colors.amber }]}>
          <Text style={[styles.previewTagText, { color: colors.background }]}>
            PREVIEW
          </Text>
        </View>
        <Text style={[styles.previewCopy, { color: colors.foreground }]}>
          {PREVIEW_COPY}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss preview notice"
        onPress={onDismiss}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.dismissButton,
          {
            opacity: pressed ? 0.7 : 1,
            borderWidth: focused ? 2 : 0,
            borderColor: focused ? colors.foreground : 'transparent',
          },
        ]}
      >
        <Feather name="x" size={16} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

function SectionLabel({
  colors,
  children,
}: {
  colors: Palette;
  children: string;
}) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
      {children}
    </Text>
  );
}

function Pitch({
  participants,
  colors,
  maxPlayers,
  selectedPitchSlots,
  goalsByUser,
  onOpenProfile,
  onSelectSpot,
  disabled,
}: {
  participants: RegistrationParticipant[];
  colors: Palette;
  maxPlayers: number;
  selectedPitchSlots: number[];
  goalsByUser: Record<string, number>;
  onOpenProfile: (participant: RegistrationParticipant) => void;
  onSelectSpot: (slotIndex: number) => void;
  disabled: boolean;
}) {
  const participantsBySlot = new Map<number, RegistrationParticipant>();
  participants.forEach((participant) => {
    if (participant.pitchSlot !== null && participant.pitchSlot !== undefined) {
      participantsBySlot.set(participant.pitchSlot, participant);
    }
  });
  participants.forEach((participant, index) => {
    if (participant.pitchSlot !== null && participant.pitchSlot !== undefined) return;
    const preferredSlot = index % 2 === 0
      ? Math.floor(index / 2)
      : 7 + Math.floor(index / 2);
    if (!participantsBySlot.has(preferredSlot)) {
      participantsBySlot.set(preferredSlot, participant);
      return;
    }
    const availableSlot = PITCH_SLOTS.findIndex((_, slotIndex) => !participantsBySlot.has(slotIndex));
    if (availableSlot >= 0) participantsBySlot.set(availableSlot, participant);
  });

  return (
    <View
      style={[
        styles.pitch,
        { borderColor: colors.pitchOutline },
      ]}
      accessibilityLabel={`Football pitch with ${maxPlayers} player spots`}
    >
      <View pointerEvents="none" style={styles.pitchStripes}>
        {Array.from({ length: 12 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.pitchStripe,
              { backgroundColor: index % 2 === 0 ? colors.pitch : colors.pitchDark },
            ]}
          />
        ))}
      </View>
      <View pointerEvents="none" style={styles.pitchOutline} />
      <View pointerEvents="none" style={[styles.pitchMidLine, { backgroundColor: '#E7F5E9' }]} />
      <View pointerEvents="none" style={styles.pitchCenterCircle} />
      <View pointerEvents="none" style={[styles.pitchGoalBox, styles.pitchTopBox]} />
      <View pointerEvents="none" style={[styles.pitchGoalBox, styles.pitchBottomBox]} />
      {PITCH_SLOTS.slice(0, maxPlayers).map((slot, index) => (
        <View
          key={`slot-${index}`}
          style={[styles.absoluteSlot, { left: `${slot.x}%`, top: slot.y }]}
        >
          <PlayerSlot
            participant={participantsBySlot.get(index) ?? null}
            colors={colors}
            teamAccent={slot.half === 0 ? colors.blue : colors.red}
            slotIndex={index}
            selected={selectedPitchSlots.includes(index)}
            goals={goalsByUser[participantsBySlot.get(index)?.userId || ''] || 0}
            onOpenProfile={onOpenProfile}
            onSelectSpot={onSelectSpot}
            disabled={disabled}
          />
        </View>
      ))}
    </View>
  );
}

function PlayerSlot({
  participant,
  colors,
  teamAccent,
  slotIndex,
  selected,
  goals,
  onOpenProfile,
  onSelectSpot,
  disabled,
}: {
  participant: RegistrationParticipant | null;
  colors: Palette;
  teamAccent: string;
  slotIndex: number;
  selected: boolean;
  goals: number;
  onOpenProfile: (participant: RegistrationParticipant) => void;
  onSelectSpot: (slotIndex: number) => void;
  disabled: boolean;
}) {
  const opacity = useRef(new Animated.Value(participant ? 0 : 1)).current;
  const scale = useRef(new Animated.Value(participant ? 0.78 : 1)).current;
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!participant) return;
    opacity.setValue(0);
    scale.setValue(0.78);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18 }),
    ]).start();
  }, [opacity, participant?.userId, scale]);

  if (!participant) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `Pitch spot ${slotIndex + 1} selected; tap to remove` : `Select open pitch spot ${slotIndex + 1}`}
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => onSelectSpot(slotIndex)}
        style={({ pressed }) => [
          styles.playerSlot,
          styles.openPlayerSlot,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={[styles.openSpot, selected && { backgroundColor: colors.primary, borderColor: colors.amber, borderStyle: 'solid', borderWidth: 3 }, !selected && focused && { borderColor: colors.foreground, borderStyle: 'solid' }]}>
          <Feather name={selected ? 'check' : 'plus'} size={18} color={selected ? colors.primaryForeground : colors.secondaryForeground} />
        </View>
        <View style={styles.nameChip}>
          <Text style={styles.playerName}>{selected ? 'Selected' : 'Open'}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Animated.View
      style={[
        styles.playerSlot,
        { opacity, transform: [{ scale }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${participant.firstName}'s player profile; ${goals} goals in this match`}
        onPress={() => onOpenProfile(participant)}
        style={[
          styles.playerAvatar,
          {
            backgroundColor: colors.secondary,
            borderColor: teamAccent,
            shadowColor: teamAccent,
          },
        ]}
      >
        <PlayerPortrait participant={participant} colors={colors} />
        <View style={styles.matchGoalBadge}><Text style={styles.matchGoalBadgeText}>⚽ {goals}</Text></View>
      </Pressable>
      <View style={styles.nameChip}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={styles.playerName}
        >
          {participant.firstName}
        </Text>
      </View>
    </Animated.View>
  );
}

function PlayerPortrait({
  participant,
  colors,
}: {
  participant: RegistrationParticipant;
  colors: Palette;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(participant.avatarUrl) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [participant.avatarUrl]);

  if (hasImage && participant.avatarUrl) {
    return (
      <Image
        accessible
        accessibilityLabel={participant.firstName}
        source={{ uri: participant.avatarUrl }}
        onError={() => setImageFailed(true)}
        style={styles.playerImage}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${participant.firstName} profile picture unavailable`}
        style={[styles.initialsAvatar, { backgroundColor: colors.secondary }]}
    >
      <Text style={[styles.initials, { color: colors.secondaryForeground }]}>
        {getInitials(participant.firstName)}
      </Text>
    </View>
  );
}

function PlayerProfileModal({ participant, stats, loading, error, colors, onClose }: {
  participant: RegistrationParticipant | null;
  stats: { firstName: string; avatarUrl: string | null; matchesPlayed: number; wins: number; draws: number; losses: number; goals: number; assists: number; yellowCards: number; redCards: number; fairPlayScore: number | null } | null;
  loading: boolean;
  error: string;
  colors: Palette;
  onClose: () => void;
}) {
  return <Modal transparent visible={Boolean(participant)} animationType="fade" onRequestClose={onClose}>
    <View style={styles.profileBackdrop}><View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close player profile" onPress={onClose} style={[styles.profileClose, { backgroundColor: colors.secondary }]}><Feather name="x" size={18} color={colors.foreground} /></Pressable>
      {participant ? <>
        <View style={[styles.profilePortrait, { borderColor: colors.primary }]}>{(stats?.avatarUrl || participant.avatarUrl) ? <Image source={{ uri: stats?.avatarUrl || participant.avatarUrl || undefined }} accessibilityLabel={`${stats?.firstName || participant.firstName}'s profile picture`} style={styles.profileImage} /> : <Text style={[styles.profileInitial, { color: colors.primary }]}>{getInitials(participant.firstName)}</Text>}</View>
        <Text style={[styles.profileName, { color: colors.foreground }]}>{stats?.firstName || participant.firstName}</Text>
        {profileDetails(stats, loading, error, colors)}
      </> : null}
    </View></View>
  </Modal>;
}

function profileDetails(stats: { matchesPlayed: number; wins: number; draws: number; losses: number; goals: number; assists: number; yellowCards: number; redCards: number; fairPlayScore: number | null } | null, loading: boolean, error: string, colors: Palette) {
  const statTiles = [
    { label: 'MATCHES', value: stats?.matchesPlayed ?? '—', icon: 'users' },
    { label: 'GOALS', value: stats?.goals ?? '—', icon: 'target' },
    { label: 'ASSISTS', value: stats?.assists ?? '—', icon: 'corner-up-right' },
    { label: 'FAIR PLAY', value: stats?.fairPlayScore == null ? '—' : `${stats.fairPlayScore}`, icon: 'shield' },
    { label: 'YELLOW', value: stats?.yellowCards ?? '—', icon: 'alert-triangle' },
    { label: 'RED', value: stats?.redCards ?? '—', icon: 'alert-octagon' },
  ] as const;
  return <>
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} /> : null}
    {error ? <Text style={[styles.profileError, { color: colors.mutedForeground }]}>{error}</Text> : null}
    {stats ? <>
      <View accessibilityLabel={`Match record: ${stats.wins} wins, ${stats.draws} draws, ${stats.losses} losses`} style={[styles.profileRecord, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.profileRecordTitle, { color: colors.mutedForeground }]}>MATCH RECORD</Text>
        <View style={styles.profileRecordValues}>
          <Text style={[styles.profileRecordValue, { color: colors.foreground }]}><Text style={{ color: colors.primary }}>W</Text> {stats.wins}</Text>
          <Text style={[styles.profileRecordValue, { color: colors.foreground }]}><Text style={{ color: colors.mutedForeground }}>D</Text> {stats.draws}</Text>
          <Text style={[styles.profileRecordValue, { color: colors.foreground }]}><Text style={{ color: '#EF4444' }}>L</Text> {stats.losses}</Text>
        </View>
      </View>
      <View style={styles.profileGrid}>{statTiles.map(tile => <View key={tile.label} style={[styles.profileStat, { backgroundColor: colors.background, borderColor: colors.border }]}><Feather name={tile.icon as never} size={14} color={tile.label === 'YELLOW' ? '#F4C542' : tile.label === 'RED' ? '#EF4444' : colors.primary} /><Text style={[styles.profileStatValue, { color: colors.foreground }]}>{tile.value}</Text><Text style={[styles.profileStatLabel, { color: colors.mutedForeground }]}>{tile.label}</Text></View>)}</View>
    </> : null}
    <Text style={[styles.profileFootnote, { color: colors.mutedForeground }]}>Fair play is an app score out of 100, reduced by cards and averaged across completed matches. Stats remain after the match archive expires.</Text>
  </>;
}

function ProgressArea({
  joinedCount,
  match,
  spotsRemaining,
  colors,
}: {
  joinedCount: number;
  match: RegistrationMatch;
  spotsRemaining: number;
  colors: Palette;
}) {
  const progress = match.maxPlayers > 0
    ? Math.min(joinedCount / match.maxPlayers, 1)
    : 0;
  const statusLabel = match.status === 'cancelled'
    ? 'Match cancelled'
    : match.status === 'full' || spotsRemaining === 0
      ? 'Match full'
      : match.status === 'confirmed'
        ? 'Match confirmed'
        : `${spotsRemaining} spots left`;
  const statusColor = match.status === 'confirmed' || match.status === 'full'
    ? colors.primary
    : colors.mutedForeground;
  return (
    <View style={styles.progressArea}>
      <View style={styles.progressLabels}>
        <Text style={[styles.progressJoined, { color: colors.foreground }]}>
          {joinedCount} of {match.maxPlayers} joined
        </Text>
        <Text
          style={[
            styles.progressStatus,
            { color: statusColor },
          ]}
        >
          {statusLabel}
        </Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Match registration progress"
        accessibilityValue={{
          min: 0,
          max: match.maxPlayers,
          now: joinedCount,
        }}
        style={[styles.progressTrack, { backgroundColor: colors.secondary }]}
      >
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${progress * 100}%` },
          ]}
        />
      </View>
      <Text style={[styles.teamsNote, { color: colors.mutedForeground }]}>
        Teams are balanced automatically once the match is confirmed.
      </Text>
    </View>
  );
}

function formatMatchDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function isRegistrationTicket(value: unknown): value is RegistrationTicket {
  if (!value || typeof value !== 'object') return false;
  const ticket = value as Record<string, unknown>;
  return typeof ticket.id === 'string'
    && typeof ticket.userId === 'string'
    && typeof ticket.firstName === 'string'
    && (typeof ticket.avatarUrl === 'string' || ticket.avatarUrl === null)
    && typeof ticket.pitchSlot === 'number'
    && typeof ticket.checkInToken === 'string'
    && typeof ticket.expiresAt === 'string';
}

function getJoinLabel({
  joining,
  joined,
  isFull,
  isCancelled,
  hasSelectedPitchSlot,
  requiredPitchSlots,
}: {
  joining: boolean;
  joined: boolean;
  isFull: boolean;
  isCancelled: boolean;
  hasSelectedPitchSlot: boolean;
  requiredPitchSlots: number;
}) {
  if (joining) return 'Joining…';
  if (joined) return "You're in";
  if (isCancelled) return 'Match cancelled';
  if (isFull) return 'Match full';
  return hasSelectedPitchSlot ? 'Confirm selected spots' : `Choose ${requiredPitchSlots} pitch spot${requiredPitchSlots === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 78,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBack: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerSubtitle: { fontSize: 12, letterSpacing: 0.4 },
  friendRow: { minHeight: 48, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingLeft: 12 },
  friendInput: { flex: 1, minHeight: 46, fontSize: 13 },
  removeFriend: { width: 42, height: 46, alignItems: 'center', justifyContent: 'center' },
  addFriendButton: { minHeight: 44, borderWidth: 1, borderStyle: 'dashed', borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 1 },
  addFriendText: { fontSize: 12, fontWeight: '700' },
  scrollContent: { flexGrow: 1, paddingBottom: 210 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20 },
  previewNotice: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 20 },
  previewContent: { flex: 1, paddingTop: 2 },
  previewTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 },
  previewTagText: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  previewCopy: { fontSize: 13, lineHeight: 19 },
  dismissButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  matchKicker: { fontSize: 12, letterSpacing: 1.3, fontWeight: '700', marginTop: 6 },
  matchTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', marginTop: 8 },
  matchSubtitle: { fontSize: 14, marginTop: 3 },
  registrationLocationCard: { marginTop: 4, marginBottom: 14, borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  registrationHero: { height: 270, overflow: 'hidden', position: 'relative' },
  registrationHeroScroller: { width: '100%', height: 270, flexGrow: 0 },
  registrationHeroSlides: { alignItems: 'stretch' },
  registrationHeroSlide: { height: 270, justifyContent: 'flex-end', flexShrink: 0, overflow: 'hidden', position: 'relative' },
  registrationHeroSlideImage: { position: 'absolute', top: 0, left: 0, height: '100%' },
  registrationHeroOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  registrationHeroCopy: { paddingHorizontal: 18, paddingBottom: 14 },
  registrationHeroDots: { position: 'absolute', left: 0, right: 0, bottom: -4, zIndex: 5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44 },
  locationSummary: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 8 },
  locationSummaryCopy: { flex: 1, minWidth: 0 },
  locationNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  locationName: { fontSize: 14, fontWeight: '800', flexShrink: 1 },
  locationAddress: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  registrationGalleryDotHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  registrationGalleryDot: { width: 7, height: 7, borderRadius: 4 },
  photoViewer: { flex: 1, backgroundColor: 'rgba(0,0,0,.97)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  fullSizePhoto: { width: '100%', height: '82%' },
  photoViewerClose: { position: 'absolute', right: 14, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(15,20,18,.72)', alignItems: 'center', justifyContent: 'center' },
  mapsLink: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingRight: 8, marginTop: 1 },
  mapsLinkText: { fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  agePolicy: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 8 },
  agePolicyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  matchTrust: { minHeight: 68, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9, marginTop: 2, marginBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  trustRating: { minHeight: 44, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustValue: { fontSize: 12, fontWeight: '800' },
  trustCaption: { fontSize: 9, lineHeight: 13, fontWeight: '600' },
  assignedReferee: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '53%', minHeight: 44 },
  assignedRefereePhoto: { width: 38, height: 38, borderRadius: 19 },
  assignedRefereeFallback: { alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 12, letterSpacing: 1.5, fontWeight: '800', marginTop: 26, marginBottom: 12 },
  pitch: { height: PITCH_HEIGHT, borderWidth: 3, borderRadius: 24, overflow: 'hidden', position: 'relative', backgroundColor: '#2FA260' },
  pitchStripes: { ...StyleSheet.absoluteFill, flexDirection: 'column' },
  pitchStripe: { width: '100%', flex: 1 },
  pitchOutline: { position: 'absolute', top: 8, bottom: 8, left: 8, right: 8, borderWidth: 1.5, borderColor: 'rgba(231,255,240,0.74)', borderRadius: 14 },
  pitchMidLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 2 },
  pitchCenterCircle: { position: 'absolute', top: '50%', left: '50%', width: 68, height: 68, marginLeft: -34, marginTop: -34, borderWidth: 2, borderColor: 'rgba(255,255,255,0.82)', borderRadius: 34 },
  pitchGoalBox: { position: 'absolute', left: '50%', width: 150, height: 46, marginLeft: -75, borderWidth: 2, borderColor: 'rgba(255,255,255,0.82)' },
  pitchTopBox: { top: -2, borderTopWidth: 0 },
  pitchBottomBox: { bottom: -2, borderBottomWidth: 0 },
  absoluteSlot: { position: 'absolute', width: 76, marginLeft: -38 },
  playerSlot: { width: 76, height: SLOT_HEIGHT, alignItems: 'center', justifyContent: 'flex-start' },
  openPlayerSlot: { justifyContent: 'flex-start' },
  playerAvatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 3.5, alignItems: 'center', justifyContent: 'center', overflow: 'visible', position: 'relative', shadowOpacity: 0.92, shadowRadius: 9, shadowOffset: { width: 0, height: 0 }, elevation: 7 },
  matchGoalBadge: { position: 'absolute', right: -15, bottom: -2, minWidth: 24, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: 'rgba(4,12,20,.94)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.3)' },
  matchGoalBadgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  playerImage: { width: '100%', height: '100%', borderRadius: 25 },
  initialsAvatar: { width: '100%', height: '100%', borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 12, fontWeight: '700' },
  nameChip: { marginTop: 4, maxWidth: 76, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 7, backgroundColor: 'rgba(7,13,26,0.78)' },
  playerName: { color: '#FFFFFF', textAlign: 'center', fontSize: 12, lineHeight: 14, fontWeight: '600' },
  openSpot: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(7,13,26,0.45)', alignItems: 'center', justifyContent: 'center' },
  progressArea: { marginTop: 18 },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 11 },
  progressJoined: { fontSize: 18, fontWeight: '700' },
  progressStatus: { fontSize: 12, fontWeight: '600', textAlign: 'right' },
  progressTrack: { height: 12, borderRadius: 6, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  teamsNote: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  preferenceNote: { fontSize: 13, marginTop: -5, marginBottom: 12 },
  positionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 6 },
  positionPill: { minHeight: 46, paddingHorizontal: 9, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  positionLabel: { fontSize: 12, fontWeight: '800' },
  goalkeeperNote: { fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 20, elevation: 10, shadowColor: '#000000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: -5 } },
  footerContent: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  joinButton: { minHeight: 54, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  joinButtonText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  paymentNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  joinError: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  ticketBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  ticketModal: { width: '100%', maxWidth: 430, maxHeight: '90%', borderWidth: 1, borderRadius: 22, padding: 18 },
  ticketTitle: { fontSize: 25, fontFamily: 'Georgia', fontWeight: '700', textAlign: 'center' },
  ticketSubtitle: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  ticketList: { flexGrow: 0, flexShrink: 1, maxHeight: '65%' },
  ticketListContent: { paddingVertical: 5, gap: 10 },
  ticketCard: { minHeight: 260, borderWidth: 1, borderRadius: 16, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 10 },
  ticketName: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  ticketExpiry: { fontSize: 10, textAlign: 'center' },
  profileBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,.76)' },
  profileCard: { width: '100%', maxWidth: 380, borderWidth: 1, borderRadius: 22, padding: 20, alignItems: 'center' },
  profileClose: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  profilePortrait: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, backgroundColor: 'rgba(200,245,58,.12)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: -5 },
  profileImage: { width: '100%', height: '100%' },
  profileInitial: { fontSize: 24, fontWeight: '900' },
  profileName: { fontFamily: 'Georgia', fontSize: 23, fontWeight: '700', marginTop: 10, marginBottom: 16 },
  profileGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileRecord: { width: '100%', minHeight: 68, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileRecordTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  profileRecordValues: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  profileRecordValue: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  profileStat: { width: '31.5%', minHeight: 90, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 4 },
  profileStatValue: { fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  profileStatLabel: { fontSize: 8, fontWeight: '900', letterSpacing: .5 },
  profileFootnote: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 13 },
  profileError: { fontSize: 11, textAlign: 'center', marginTop: 12 },
});


