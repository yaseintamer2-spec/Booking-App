// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const matchesTable = pgTable(
  "football_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    venueName: text("venue_name").notNull(),
    neighborhood: text("neighborhood").notNull(),
    address: text("address").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    format: text("format").notNull().default("7v7"),
    capacity: integer("capacity").notNull().default(14),
    bookedCount: integer("booked_count").notNull().default(0),
    priceHalalas: integer("price_halalas").notNull().default(3000),
    compareAtPriceHalalas: integer("compare_at_price_halalas")
      .notNull()
      .default(3500),
    status: text("status").notNull().default("draft"),
    refereeIncluded: boolean("referee_included").notNull().default(true),
    refereeUserId: text("referee_user_id"),
    refereeName: text("referee_name"),
    refereeAvatarUrl: text("referee_avatar_url"),
    refereeAssignmentStatus: text("referee_assignment_status"),
    liveStatus: text("live_status").notNull().default("scheduled"),
    liveStartedAt: timestamp("live_started_at", { withTimezone: true }),
    livePhaseStartedAt: timestamp("live_phase_started_at", { withTimezone: true }),
    liveFirstHalfEndedAt: timestamp("live_first_half_ended_at", { withTimezone: true }),
    liveSecondHalfStartedAt: timestamp("live_second_half_started_at", { withTimezone: true }),
    liveEndedAt: timestamp("live_ended_at", { withTimezone: true }),
    waterIncluded: boolean("water_included").notNull().default(true),
    imageUrl: text("image_url").notNull().default("match-card"),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("football_matches_status_starts_at_idx").on(
      table.status,
      table.startsAt,
    ),
    index("football_matches_live_status_ended_idx").on(table.liveStatus, table.liveEndedAt),
    check(
      "football_matches_capacity_positive",
      sql`${table.capacity} > 0 AND ${table.bookedCount} >= 0 AND ${table.bookedCount} <= ${table.capacity}`,
    ),
    check(
      "football_matches_prices_nonnegative",
      sql`${table.priceHalalas} >= 0 AND ${table.compareAtPriceHalalas} >= ${table.priceHalalas}`,
    ),
  ],
);

export const registrationsTable = pgTable(
  "match_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    bookedByUserId: text("booked_by_user_id").notNull(),
    firstName: text("first_name").notNull(),
    avatarUrl: text("avatar_url"),
    pitchSlot: integer("pitch_slot"),
    positionPreference: text("position_preference").notNull().default("anywhere"),
    status: text("status").notNull().default("joined"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    checkinTokenHash: text("checkin_token_hash"),
    checkinExpiresAt: timestamp("checkin_expires_at", { withTimezone: true }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_registrations_match_user_idx").on(table.matchId, table.userId),
    uniqueIndex("match_registrations_match_pitch_slot_idx")
      .on(table.matchId, table.pitchSlot)
      .where(sql`${table.pitchSlot} IS NOT NULL AND ${table.status} IN ('joined', 'checked_in')`),
    index("match_registrations_match_status_created_idx").on(table.matchId, table.status, table.createdAt),
    index("match_registrations_user_status_idx").on(table.userId, table.status),
    index("match_registrations_booker_status_idx").on(table.bookedByUserId, table.status),
    check("match_registrations_status_check", sql`${table.status} IN ('joined', 'waitlisted', 'offered', 'cancelled', 'checked_in')`),
    check("match_registrations_pitch_slot_check", sql`${table.pitchSlot} IS NULL OR (${table.pitchSlot} >= 0 AND ${table.pitchSlot} < 14)`),
    check("match_registrations_position_check", sql`${table.positionPreference} IN ('anywhere', 'goalkeeper', 'defender', 'midfielder', 'attacker')`),
  ],
);

export const matchRatingsTable = pgTable(
  "match_ratings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    pitchRating: integer("pitch_rating").notNull(),
    refereeRating: integer("referee_rating"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_ratings_match_user_idx").on(table.matchId, table.userId),
    index("match_ratings_match_idx").on(table.matchId),
    check("match_ratings_pitch_check", sql`${table.pitchRating} BETWEEN 1 AND 5`),
    check("match_ratings_referee_check", sql`${table.refereeRating} IS NULL OR ${table.refereeRating} BETWEEN 1 AND 5`),
  ],
);

export const matchEventsTable = pgTable(
  "match_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
    clientEventId: text("client_event_id").notNull(),
    type: text("type").notNull().default("goal"),
    team: text("team").notNull(),
    period: integer("period").notNull(),
    minute: integer("minute").notNull(),
    scorerUserId: text("scorer_user_id").notNull(),
    scorerName: text("scorer_name").notNull(),
    assistUserId: text("assist_user_id"),
    assistName: text("assist_name"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedByUserId: text("recorded_by_user_id").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: text("voided_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("match_events_client_event_idx").on(table.matchId, table.clientEventId),
    index("match_events_match_created_idx").on(table.matchId, table.createdAt),
    check("match_events_type_check", sql`${table.type} IN ('goal', 'yellow_card', 'red_card')`),
    check("match_events_team_check", sql`${table.team} IN ('red', 'blue')`),
    check("match_events_period_check", sql`${table.period} IN (1, 2)`),
    check("match_events_minute_check", sql`${table.minute} > 0`),
  ],
);

export const notificationsTable = pgTable(
  "player_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    matchId: uuid("match_id").references(() => matchesTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    pushSentAt: timestamp("push_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("player_notifications_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("player_notifications_match_reminder_unique").on(table.userId, table.matchId).where(sql`${table.kind} = 'match_reminder' AND ${table.matchId} IS NOT NULL`),
    uniqueIndex("player_notifications_referee_24h_unique").on(table.userId, table.matchId).where(sql`${table.kind} = 'referee_match_reminder_24h' AND ${table.matchId} IS NOT NULL`),
    uniqueIndex("player_notifications_referee_1h_unique").on(table.userId, table.matchId).where(sql`${table.kind} = 'referee_match_reminder_1h' AND ${table.matchId} IS NOT NULL`),
  ],
);

export const refereeMatchApplicationsTable = pgTable(
  "referee_match_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id").notNull().references(() => matchesTable.id, { onDelete: "cascade" }),
    refereeUserId: text("referee_user_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("referee_match_applications_match_user_unique").on(table.matchId, table.refereeUserId),
    index("referee_match_applications_status_created_idx").on(table.status, table.createdAt),
    check("referee_match_applications_status_check", sql`${table.status} IN ('pending', 'invited', 'confirmed', 'declined', 'rejected')`),
  ],
);

export const matchAlertSubscriptionsTable = pgTable(
  "match_alert_subscriptions",
  {
    userId: text("user_id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const pushTokensTable = pgTable(
  "player_push_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    expoPushToken: text("expo_push_token").notNull(),
    platform: text("platform").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("player_push_tokens_token_idx").on(table.expoPushToken),
    index("player_push_tokens_user_idx").on(table.userId),
    check("player_push_tokens_platform_check", sql`${table.platform} IN ('ios', 'android')`),
  ],
);

export const playerCareerStatsTable = pgTable(
  "player_career_stats",
  {
    userId: text("user_id").primaryKey(),
    matchesPlayed: integer("matches_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    yellowCards: integer("yellow_cards").notNull().default(0),
    redCards: integer("red_cards").notNull().default(0),
    fairPlayPoints: integer("fair_play_points").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("player_career_stats_goals_idx").on(table.goals)],
);

/** Email grants managed by the single application owner; only verified Clerk emails can use them. */
export const adminAccessTable = pgTable(
  "admin_access",
  {
    email: text("email").primaryKey(),
    grantedByUserId: text("granted_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Referee roles managed by admins using verified sign-in emails. */
export const refereeAccessTable = pgTable("referee_access", {
  email: text("email").primaryKey(),
  grantedByUserId: text("granted_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pitchOwnerAccessTable = pgTable(
  "pitch_owner_access",
  {
    email: text("email").primaryKey(),
    venueName: text("venue_name").notNull(),
    neighborhood: text("neighborhood").notNull(),
    address: text("address").notNull(),
    grantedByUserId: text("granted_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const pitchMatchSubmissionsTable = pgTable(
  "pitch_match_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    venueName: text("venue_name").notNull(),
    neighborhood: text("neighborhood").notNull(),
    address: text("address").notNull(),
    contactPhone: text("contact_phone").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    capacity: integer("capacity").notNull().default(14),
    priceHalalas: integer("price_halalas").notNull(),
    compareAtPriceHalalas: integer("compare_at_price_halalas").notNull(),
    refereeIncluded: boolean("referee_included").notNull().default(true),
    waterIncluded: boolean("water_included").notNull().default(true),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    matchId: uuid("match_id").references(() => matchesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("pitch_match_submissions_owner_created_idx").on(table.ownerUserId, table.createdAt),
    index("pitch_match_submissions_status_starts_idx").on(table.status, table.startsAt),
    check("pitch_match_submissions_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    check("pitch_match_submissions_contact_phone_check", sql`length(trim(${table.contactPhone})) >= 8`),
    check("pitch_match_submissions_capacity_check", sql`${table.capacity} BETWEEN 2 AND 30`),
    check("pitch_match_submissions_duration_check", sql`${table.durationMinutes} BETWEEN 30 AND 240`),
    check("pitch_match_submissions_price_check", sql`${table.priceHalalas} >= 0 AND ${table.compareAtPriceHalalas} >= ${table.priceHalalas}`),
  ],
);

/** A player's profile-only position label. It does not affect match registrations or balancing. */
export const playerProfilesTable = pgTable(
  "player_profiles",
  {
    userId: text("user_id").primaryKey(),
    preferredPosition: text("preferred_position").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("player_profiles_preferred_position_check", sql`${table.preferredPosition} IN ('striker', 'defender', 'midfielder', 'winger')`),
  ],
);
