import type { Match } from '@workspace/api-client-react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PositionPreference =
  | 'anywhere'
  | 'goalkeeper'
  | 'defender'
  | 'midfielder'
  | 'attacker';

export type RegistrationMatchStatus =
  | 'open'
  | 'confirmed'
  | 'full'
  | 'cancelled';

export type RegistrationParticipant = {
  userId: string;
  firstName: string;
  avatarUrl: string | null;
  pitchSlot?: number | null;
  positionPreference: PositionPreference;
};

export type RegistrationMatch = {
  id: string;
  startsAt: string;
  pitchName: string;
  area: string;
  address?: string;
  imageUrl?: string;
  imageUrls?: (string | number)[];
  pricePerPlayer: number;
  durationHours: number;
  maxGoalkeepers: number;
  maxPlayers: number;
  ageGroup: '13-16' | '16-20' | '20+';
  status: RegistrationMatchStatus;
  pitchRatingAverage?: number | null;
  pitchRatingCount?: number;
  refereeName?: string | null;
  refereeAvatarUrl?: string | null;
};

export type RegistrationCurrentUser = {
  userId: string;
  firstName: string;
  avatarUrl: string | null;
};

// Mock data only: replace this fixture with the match and participant API later.
export const matchRegistrationMock: {
  match: RegistrationMatch;
  participants: RegistrationParticipant[];
  currentUser: RegistrationCurrentUser;
} = {
  match: {
    id: 'riyadh-thursday-7v7',
    startsAt: '2026-11-26T18:00:00.000Z',
    pitchName: 'Al Malqa Arena',
    area: 'Al Malqa, Riyadh',
    address: 'King Abdulaziz Road, Al Malqa, Riyadh',
    imageUrls: [
      require('../assets/images/football-match-card.jpg'),
      require('../assets/images/home-pitch-hero.jpg'),
      require('../assets/images/home-stadium-sunset.png'),
    ],
    pricePerPlayer: 30,
    durationHours: 2,
    maxGoalkeepers: 2,
    maxPlayers: 14,
    ageGroup: '13-16',
    status: 'open',
    refereeName: 'Omar Al-Harbi',
  },
  participants: [
    { userId: 'u1', firstName: 'Marcus', avatarUrl: 'https://i.pravatar.cc/120?img=12', positionPreference: 'goalkeeper' },
    { userId: 'u2', firstName: 'Jamie', avatarUrl: 'https://i.pravatar.cc/120?img=33', positionPreference: 'defender' },
    { userId: 'u3', firstName: 'Alexandre', avatarUrl: 'https://i.pravatar.cc/120?img=15', positionPreference: 'midfielder' },
    { userId: 'u4', firstName: 'Noah', avatarUrl: 'https://i.pravatar.cc/120?img=52', positionPreference: 'anywhere' },
    { userId: 'u5', firstName: 'Theo', avatarUrl: 'https://i.pravatar.cc/120?img=60', positionPreference: 'attacker' },
    { userId: 'u6', firstName: 'Sam', avatarUrl: 'https://i.pravatar.cc/120?img=68', positionPreference: 'anywhere' },
    { userId: 'u7', firstName: 'Abdulrahman', avatarUrl: 'https://i.pravatar.cc/120?img=8', positionPreference: 'defender' },
    { userId: 'u8', firstName: 'Turki', avatarUrl: null, positionPreference: 'midfielder' },
    { userId: 'u9', firstName: 'Daniel', avatarUrl: 'https://i.pravatar.cc/120?img=14', positionPreference: 'attacker' },
  ],
  currentUser: { userId: 'me', firstName: 'Yasein', avatarUrl: null },
};

/** Local match listing used in offline web development previews. */
export const sampleMatchListing: Match = {
  id: matchRegistrationMock.match.id,
  venueName: matchRegistrationMock.match.pitchName,
  neighborhood: matchRegistrationMock.match.area,
  address: matchRegistrationMock.match.address || matchRegistrationMock.match.area,
  startsAt: matchRegistrationMock.match.startsAt,
  durationMinutes: matchRegistrationMock.match.durationHours * 60,
  format: '7v7',
  capacity: matchRegistrationMock.match.maxPlayers,
  ageGroup: matchRegistrationMock.match.ageGroup,
  bookedCount: matchRegistrationMock.participants.length,
  spotsRemaining: Math.max(0, matchRegistrationMock.match.maxPlayers - matchRegistrationMock.participants.length),
  priceHalalas: Math.round(matchRegistrationMock.match.pricePerPlayer * 100),
  compareAtPriceHalalas: Math.round(matchRegistrationMock.match.pricePerPlayer * 100),
  status: 'published',
  refereeIncluded: true,
  refereeUserId: null,
  refereeName: matchRegistrationMock.match.refereeName ?? null,
  refereeAvatarUrl: null,
  pitchRatingAverage: null,
  pitchRatingCount: 0,
  waterIncluded: true,
  imageUrl: matchRegistrationMock.match.imageUrl || '',
  imageUrls: ['local:football-match-card', 'local:home-pitch-hero', 'local:home-stadium-sunset'],
  isDemo: false,
  createdAt: matchRegistrationMock.match.startsAt,
};

/** Local-only stand-in; replace with the app's join/payment action later. */
const SAMPLE_PARTICIPANTS_KEY = 'kickoff.sample-match.participants.v1';

/** Persist local sample bookings across app reloads. */
export async function loadSampleParticipants(): Promise<RegistrationParticipant[]> {
  try {
    const stored = await AsyncStorage.getItem(SAMPLE_PARTICIPANTS_KEY);
    if (!stored) return matchRegistrationMock.participants;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return matchRegistrationMock.participants;
    const added = parsed.filter((row): row is RegistrationParticipant =>
      !!row && typeof row === 'object' && typeof row.userId === 'string' && typeof row.firstName === 'string' &&
      (typeof row.avatarUrl === 'string' || row.avatarUrl === null) &&
      ['anywhere', 'goalkeeper', 'defender', 'midfielder', 'attacker'].includes(row.positionPreference),
    );
    return [...matchRegistrationMock.participants, ...added];
  } catch {
    return matchRegistrationMock.participants;
  }
}

export async function saveSampleParticipants(participants: RegistrationParticipant[]): Promise<void> {
  const fixtureIds = new Set(matchRegistrationMock.participants.map(({ userId }) => userId));
  await AsyncStorage.setItem(SAMPLE_PARTICIPANTS_KEY, JSON.stringify(participants.filter(({ userId }) => !fixtureIds.has(userId))));
}

export function mockJoinMatch(_matchId: string, _position: PositionPreference) {
  return new Promise<void>((resolve) => setTimeout(resolve, 900));
}
