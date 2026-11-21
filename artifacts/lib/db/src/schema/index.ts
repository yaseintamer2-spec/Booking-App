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

export const notificationsTable = pgTable(
  "player_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    matchId: uuid("match_id").references(() => matchesTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("player_notifications_user_created_idx").on(table.userId, table.createdAt)],
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
