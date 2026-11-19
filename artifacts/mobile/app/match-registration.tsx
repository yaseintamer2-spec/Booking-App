import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  matchRegistrationMock,
  type PositionPreference,
  type RegistrationMatch,
  type RegistrationParticipant,
} from '@/data/matchRegistrationMock';

const SHOW_PREVIEW_NOTICE = true;
const MAX_GOALKEEPERS = 2;
const PREVIEW_COPY =
  "For illustrative purposes only. This isn't the final result: the match shown is a sample, and the design and prices may change.";
const POSITION_OPTIONS: { label: string; value: PositionPreference }[] = [
  { label: 'Anywhere', value: 'anywhere' },
  { label: 'Goalkeeper', value: 'goalkeeper' },
  { label: 'Defender', value: 'defender' },
  { label: 'Midfielder', value: 'midfielder' },
  { label: 'Attacker', value: 'attacker' },
];
const PITCH_ROWS = [[0, 1], [2, 3], [4, 5], [6]];

type Palette = ReturnType<typeof useColors>;

export default function MatchRegistrationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [noticeVisible, setNoticeVisible] = useState(SHOW_PREVIEW_NOTICE);
  const [participants, setParticipants] = useState(
    matchRegistrationMock.participants,
  );
  const [positionPreference, setPositionPreference] =
    useState<PositionPreference>('anywhere');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [focusedPosition, setFocusedPosition] =
    useState<PositionPreference | null>(null);
  const [joinButtonFocused, setJoinButtonFocused] = useState(false);

  const { match } = matchRegistrationMock;
  const joinedCount = participants.length;
  const isFull = joinedCount >= match.maxPlayers || match.status === 'full';
  const isCancelled = match.status === 'cancelled';
  const spotsRemaining = Math.max(0, match.maxPlayers - joinedCount);
  const goalkeeperCount = participants.filter(
    (participant) => participant.positionPreference === 'goalkeeper',
  ).length;
  const goalkeeperLimitReached = goalkeeperCount >= MAX_GOALKEEPERS;

  const joinMatch = () => {
    if (joining || joined || isFull || isCancelled) return;

    setJoining(true);
    setTimeout(() => {
      setParticipants((current) => {
        if (current.length >= match.maxPlayers) return current;
        return [
          ...current,
          {
            userId: 'current-player',
            firstName: 'You',
            avatarUrl: null,
            positionPreference,
          },
        ];
      });
      setJoined(true);
      setJoining(false);
    }, 550);
  };

  const dateTitle = formatMatchDate(match.startsAt);
  const joinLabel = getJoinLabel({
    joining,
    joined,
    isFull,
    isCancelled,
    pricePerPlayer: match.pricePerPlayer,
  });

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
              onPress={() => router.back()}
              style={styles.headerBack}
            >
              <Feather name="arrow-left" size={21} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              MATCH REGISTRATION
            </Text>
          </View>
          {noticeVisible ? (
            <PreviewNotice
              colors={colors}
              onDismiss={() => setNoticeVisible(false)}
            />
          ) : null}
          <Text style={[styles.matchKicker, { color: colors.primary }]}>
            7x7 · 2 HOURS · REFEREE INCLUDED
          </Text>
          <Text style={[styles.matchTitle, { color: colors.foreground }]}>
            {dateTitle}
          </Text>
          <Text style={[styles.matchSubtitle, { color: colors.mutedForeground }]}>
            {match.pitchName} · {match.area}
          </Text>

          <SectionLabel colors={colors}>PLAYERS</SectionLabel>
          <Pitch
            participants={participants}
            colors={colors}
            onJoinSpot={joinMatch}
          />

          <ProgressArea
            joinedCount={joinedCount}
            match={match}
            spotsRemaining={spotsRemaining}
            colors={colors}
          />

          <SectionLabel colors={colors}>YOUR POSITION</SectionLabel>
          <Text style={[styles.preferenceNote, { color: colors.mutedForeground }]}>
            Just a preference — teams are balanced automatically.
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
                      backgroundColor: selected ? colors.accent : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
                      borderWidth: focusedPosition === option.value ? 2 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.positionLabel,
                      { color: selected ? colors.primary : colors.foreground },
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
              The match already has the maximum of {MAX_GOALKEEPERS} goalkeepers.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View
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
              disabled: joining || joined || isFull || isCancelled,
              busy: joining,
            }}
            disabled={joining || joined || isFull || isCancelled}
            onFocus={() => setJoinButtonFocused(true)}
            onBlur={() => setJoinButtonFocused(false)}
            onPress={joinMatch}
            style={({ pressed }) => [
              styles.joinButton,
              {
                backgroundColor: colors.primary,
                opacity:
                  isFull || isCancelled
                    ? 0.48
                    : pressed && !joining && !joined
                      ? 0.82
                      : 1,
                borderWidth: joinButtonFocused ? 2 : 0,
                borderColor: joinButtonFocused ? colors.foreground : 'transparent',
              },
            ]}
          >
            {joining ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : joined ? (
              <Feather
                name="check"
                size={17}
                color={colors.primaryForeground}
              />
            ) : null}
            <Text style={[styles.joinButtonText, { color: colors.primaryForeground }]}>
              {joinLabel}
            </Text>
          </Pressable>
          <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
            Pay with mada or Apple Pay · full refund if the match isn't confirmed
          </Text>
        </View>
      </View>
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
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={[styles.previewTag, { backgroundColor: colors.accent }]}>
        <Text style={[styles.previewTagText, { color: colors.primary }]}>
          PREVIEW
        </Text>
      </View>
      <Text style={[styles.previewCopy, { color: colors.secondaryForeground }]}>
        {PREVIEW_COPY}
      </Text>
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
    <Text style={[styles.sectionLabel, { color: colors.primary }]}>
      {children}
    </Text>
  );
}

function Pitch({
  participants,
  colors,
  onJoinSpot,
}: {
  participants: RegistrationParticipant[];
  colors: Palette;
  onJoinSpot: () => void;
}) {
  const topHalf = participants.filter((_, index) => index % 2 === 0);
  const bottomHalf = participants.filter((_, index) => index % 2 === 1);

  return (
    <View
      style={[
        styles.pitch,
        { backgroundColor: colors.accent, borderColor: colors.border },
      ]}
    >
      <View pointerEvents="none" style={styles.pitchOutline} />
      <View pointerEvents="none" style={[styles.pitchCenterLine, { backgroundColor: colors.border }]} />
      <View pointerEvents="none" style={[styles.pitchCenterCircle, { borderColor: colors.border }]} />
      <PitchHalf
        players={topHalf}
        colors={colors}
        teamLabel="TEAM A"
        teamAccent="#FF5D5D"
        onJoinSpot={onJoinSpot}
        reverseRows
      />
      <View pointerEvents="none" style={[styles.pitchCenterLine, { backgroundColor: colors.border }]} />
      <View pointerEvents="none" style={[styles.pitchCenterCircle, { borderColor: colors.border }]} />
      <PitchHalf
        players={bottomHalf}
        colors={colors}
        teamLabel="TEAM B"
        teamAccent="#FF8C8C"
        onJoinSpot={onJoinSpot}
      />
    </View>
  );
}

function PitchHalf({
  players,
  colors,
  teamLabel,
  teamAccent,
  onJoinSpot,
  reverseRows = false,
}: {
  players: (RegistrationParticipant | null)[];
  colors: Palette;
  teamLabel: string;
  teamAccent: string;
  onJoinSpot: () => void;
  reverseRows?: boolean;
}) {
  const rows = reverseRows ? [...PITCH_ROWS].reverse() : PITCH_ROWS;
  return (
    <View style={styles.pitchHalf}>
      <View style={styles.teamLabelRow}>
        <View style={[styles.teamDot, { backgroundColor: teamAccent }]} />
        <Text style={[styles.teamLabel, { color: teamAccent }]}>{teamLabel}</Text>
      </View>
      {rows.map((row, rowIndex) => (
        <View key={`${reverseRows ? 'top' : 'bottom'}-${rowIndex}`} style={styles.pitchRow}>
          {row.map((slotIndex) => (
            <PlayerSlot
              key={slotIndex}
              participant={players[slotIndex] ?? null}
              colors={colors}
              teamAccent={teamAccent}
              onJoinSpot={onJoinSpot}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function PlayerSlot({
  participant,
  colors,
  teamAccent,
  onJoinSpot,
}: {
  participant: RegistrationParticipant | null;
  colors: Palette;
  teamAccent: string;
  onJoinSpot: () => void;
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
        accessibilityLabel="Open player spot. Join this match."
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={onJoinSpot}
        style={({ pressed }) => [
          styles.playerSlot,
          styles.openPlayerSlot,
          { borderColor: teamAccent },
          {
            opacity: pressed ? 0.7 : 1,
            borderWidth: focused ? 2 : 0,
            borderColor: focused ? colors.foreground : 'transparent',
          },
        ]}
      >
        <View style={[styles.openSpot, { borderColor: colors.secondaryForeground }]}>
          <Feather name="plus" size={18} color={colors.secondaryForeground} />
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
      <View
        style={[
          styles.playerAvatar,
          { backgroundColor: colors.secondary, borderColor: teamAccent },
        ]}
      >
        <PlayerPortrait participant={participant} colors={colors} />
      </View>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={[styles.playerName, { color: colors.foreground }]}
      >
        {participant.firstName}
      </Text>
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
        Teams are balanced evenly as players join.
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

function getJoinLabel({
  joining,
  joined,
  isFull,
  isCancelled,
  pricePerPlayer,
}: {
  joining: boolean;
  joined: boolean;
  isFull: boolean;
  isCancelled: boolean;
  pricePerPlayer: number;
}) {
  if (joining) return 'Joining…';
  if (joined) return "You're in";
  if (isCancelled) return 'Match cancelled';
  if (isFull) return 'Match full';
  return `Join match · ${pricePerPlayer} SAR`;
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
  scrollContent: { flexGrow: 1, paddingBottom: 130 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20 },
  previewNotice: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 20 },
  previewTag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, marginTop: 1 },
  previewTagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  previewCopy: { flex: 1, fontSize: 11, lineHeight: 16 },
  dismissButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  matchKicker: { fontSize: 10, letterSpacing: 1.4, fontWeight: '700', marginTop: 6 },
  matchTitle: { fontFamily: 'Georgia', fontSize: 29, lineHeight: 36, marginTop: 8 },
  matchSubtitle: { fontSize: 12, marginTop: 3 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.6, fontWeight: '800', marginTop: 26, marginBottom: 12 },
  pitch: { height: 468, borderWidth: 1, borderRadius: 18, overflow: 'hidden', position: 'relative', paddingHorizontal: 8 },
  pitchOutline: { position: 'absolute', top: 8, bottom: 8, left: 12, right: 12, borderWidth: 1, borderColor: 'rgba(211,222,214,0.18)', borderRadius: 14 },
  pitchCenterLine: { position: 'absolute', top: '50%', left: 12, right: 12, height: 1, opacity: 0.8 },
  pitchCenterCircle: { position: 'absolute', top: '50%', left: '50%', width: 58, height: 58, marginLeft: -29, marginTop: -29, borderWidth: 1, borderRadius: 29, opacity: 0.8 },
  pitchHalf: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 2 },
  teamLabelRow: { height: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  teamDot: { width: 6, height: 6, borderRadius: 3 },
  teamLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  playerSlot: { width: 74, height: 50, alignItems: 'center', justifyContent: 'flex-start' },
  openPlayerSlot: { justifyContent: 'center' },
  playerAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  playerImage: { width: '100%', height: '100%', borderRadius: 17 },
  initialsAvatar: { width: '100%', height: '100%', borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 12, fontWeight: '700' },
  playerName: { width: 72, textAlign: 'center', fontSize: 10, lineHeight: 13, marginTop: 3 },
  openSpot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  progressArea: { marginTop: 18 },
  progressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 11 },
  progressJoined: { fontSize: 13, fontWeight: '700' },
  progressStatus: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
  progressTrack: { height: 8, borderRadius: 5, overflow: 'visible', position: 'relative' },
  progressFill: { height: '100%', borderRadius: 5 },
  teamsNote: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  preferenceNote: { fontSize: 11, marginTop: -5, marginBottom: 12 },
  positionOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  positionPill: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  positionLabel: { fontSize: 12, fontWeight: '600' },
  goalkeeperNote: { fontSize: 11, marginTop: 9 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 20 },
  footerContent: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  joinButton: { minHeight: 54, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  joinButtonText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  paymentNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
});

