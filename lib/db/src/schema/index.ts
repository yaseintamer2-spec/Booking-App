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
  pgTable,
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
    waterIncluded: boolean("water_included").notNull().default(true),
    imageUrl: text("image_url").notNull().default("match-card"),
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