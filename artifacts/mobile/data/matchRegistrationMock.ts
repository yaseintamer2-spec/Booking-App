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
  pricePerPlayer: number;
  durationHours: number;
  maxGoalkeepers: number;
  maxPlayers: number;
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
    id: 'riyadh-demo-match',
    startsAt: '2026-11-26T18:00:00.000Z',
    pitchName: 'Al Malqa Arena',
    area: 'Al Malqa, Riyadh',
    address: 'King Abdulaziz Road, Al Malqa, Riyadh',
    pricePerPlayer: 30,
    durationHours: 2,
    maxGoalkeepers: 2,
    maxPlayers: 14,
    status: 'open',
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

/** Local-only stand-in; replace with the app's join/payment action later. */
export function mockJoinMatch(_matchId: string, _position: PositionPreference) {
  return new Promise<void>((resolve) => setTimeout(resolve, 900));
}
