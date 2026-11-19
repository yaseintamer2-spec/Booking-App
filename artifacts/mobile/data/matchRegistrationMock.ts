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
  positionPreference: PositionPreference;
};

export type RegistrationMatch = {
  id: string;
  startsAt: string;
  pitchName: string;
  area: string;
  pricePerPlayer: number;
  minPlayers: number;
  maxPlayers: number;
  status: RegistrationMatchStatus;
};

// Mock data only: replace this fixture with the match and participant API later.
export const matchRegistrationMock: {
  match: RegistrationMatch;
  participants: RegistrationParticipant[];
} = {
  match: {
    id: 'riyadh-demo-match',
    startsAt: '2026-11-26T18:00:00.000Z',
    pitchName: 'The Green Pitch',
    area: 'Al Malqa, Riyadh',
    pricePerPlayer: 30,
    minPlayers: 12,
    maxPlayers: 14,
    status: 'open',
  },
  participants: [
    { userId: 'player-01', firstName: 'Omar', avatarUrl: null, positionPreference: 'goalkeeper' },
    { userId: 'player-02', firstName: 'Faisal', avatarUrl: null, positionPreference: 'defender' },
    { userId: 'player-03', firstName: 'Khalid', avatarUrl: null, positionPreference: 'midfielder' },
    { userId: 'player-04', firstName: 'Yousef', avatarUrl: null, positionPreference: 'attacker' },
    { userId: 'player-05', firstName: 'Abdulrahman', avatarUrl: null, positionPreference: 'defender' },
    { userId: 'player-06', firstName: 'Nasser', avatarUrl: null, positionPreference: 'midfielder' },
    { userId: 'player-07', firstName: 'Saud', avatarUrl: null, positionPreference: 'anywhere' },
    { userId: 'player-08', firstName: 'Majed', avatarUrl: null, positionPreference: 'goalkeeper' },
    { userId: 'player-09', firstName: 'Turki', avatarUrl: null, positionPreference: 'attacker' },
  ],
};
