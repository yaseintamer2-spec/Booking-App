import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  CreateAdminMatchBody,
  CreateAdminMatchResponse,
  DeleteAdminMatchParams,
  GetCurrentUserResponse,
  GetMatchParams,
  GetMatchResponse,
  ListAdminMatchesResponse,
  ListMatchesResponse,
  UpdateAdminMatchBody,
  UpdateAdminMatchParams,
  UpdateAdminMatchResponse,
  isMatchAgeGroup,
  isGoogleMapsUrl,
} from "@workspace/api-zod";
import { adminAccessTable, db, matchAlertSubscriptionsTable, matchEventsTable, matchRatingsTable, matchesTable, notificationsTable, pitchMatchSubmissionsTable, pitchOwnerAccessTable, playerCareerStatsTable, playerProfilesTable, pushTokensTable, refereeAccessTable, refereeMatchApplicationsTable, registrationsTable } from "@workspace/db";
import { isAdminUser, isMatchStaffUser, isOwnerUser, isPitchOwnerUser, OWNER_EMAIL, requireAdmin, requireAuth, requireOwner, requirePitchOwner } from "../middlewares/auth";
import { getMatchEndAt, WAITLIST_OFFER_TTL_MS, canConfirmPaidRegistration, canReserveSeat, isCheckInTokenValid, isOfferExpired, isStoredMatchImageList } from "../lib/registration-rules";
import { isMatchImageStorageConfigured, uploadMatchImage } from "../lib/match-image-storage";
const MATCH_ARCHIVE_HOURS = 12;

const router: IRouter = Router();

router.post("/match-images", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  if (!(await isAdminUser(userId)) && !(await isPitchOwnerUser(userId))) {
    res.status(403).json({ error: "Admin or pitch owner access is required to upload pitch photos." }); return;
  }
  try {
    res.status(201).json({ url: await uploadMatchImage(req.body?.imageDataUrl, userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload the pitch photo.";
    res.status(message.includes("not configured") ? 503 : 400).json({ error: message });
  }
});

router.post("/admin/match-images/migrate", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  if (!isMatchImageStorageConfigured()) {
    res.status(503).json({ error: "Pitch photo storage is not configured. Set the OBJECT_STORAGE_* settings on the API, then retry." }); return;
  }
  let migratedPhotos = 0;
  const migrateRows = async (rows: Array<{ id: string; imageUrls: string[]; imageUrl?: string }>, save: (id: string, imageUrls: string[]) => Promise<unknown>) => {
    for (const row of rows) {
      const source = row.imageUrls?.length ? row.imageUrls : row.imageUrl?.startsWith("data:image/") ? [row.imageUrl] : [];
      if (!source.some((image) => image.startsWith("data:image/"))) continue;
      const imageUrls = [...source];
      for (let index = 0; index < imageUrls.length; index += 1) {
        if (!imageUrls[index].startsWith("data:image/")) continue;
        imageUrls[index] = await uploadMatchImage(imageUrls[index], res.locals.userId as string);
        await save(row.id, imageUrls);
        migratedPhotos += 1;
      }
    }
  };
  const matches = await db.select({ id: matchesTable.id, imageUrls: matchesTable.imageUrls, imageUrl: matchesTable.imageUrl }).from(matchesTable);
  await migrateRows(matches, async (id, imageUrls) => db.update(matchesTable).set({ imageUrls, imageUrl: imageUrls.length ? "match-card" : "" }).where(eq(matchesTable.id, id)));
  const submissions = await db.select({ id: pitchMatchSubmissionsTable.id, imageUrls: pitchMatchSubmissionsTable.imageUrls }).from(pitchMatchSubmissionsTable);
  await migrateRows(submissions, async (id, imageUrls) => db.update(pitchMatchSubmissionsTable).set({ imageUrls }).where(eq(pitchMatchSubmissionsTable.id, id)));
  res.json({ migratedPhotos });
});

function paramId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function getPitchOwnerAccess(userId: string) {
  const user = await clerkClient.users.getUser(userId);
  const emails = user.emailAddresses.filter((address) => address.verification?.status === "verified").map((address) => address.emailAddress.trim().toLowerCase());
  if (!emails.length) return null;
  const [access] = await db.select().from(pitchOwnerAccessTable).where(inArray(pitchOwnerAccessTable.email, emails)).limit(1);
  return access ?? null;
}

function toMatch(row: typeof matchesTable.$inferSelect) {
  const imageUrls = Array.isArray(row.imageUrls) && row.imageUrls.length
    ? row.imageUrls
    : /^https:\/\//i.test(row.imageUrl) || /^data:image\//i.test(row.imageUrl) ? [row.imageUrl] : [];
  return {
    ...row,
    imageUrls,
    refereeUserId: row.refereeUserId,
    refereeName: row.refereeName,
    refereeAvatarUrl: row.refereeAvatarUrl,
    spotsRemaining: Math.max(0, row.capacity - row.bookedCount),
  };
}

async function addPitchRatings<T extends typeof matchesTable.$inferSelect>(rows: T[]) {
  if (!rows.length) return [];
  const venueNames = [...new Set(rows.map(({ venueName }) => venueName))];
  const aggregates = await db.select({
    venueName: matchesTable.venueName,
    average: sql<number>`avg(${matchRatingsTable.pitchRating})`,
    count: sql<number>`count(${matchRatingsTable.id})`,
  }).from(matchRatingsTable)
    .innerJoin(matchesTable, eq(matchRatingsTable.matchId, matchesTable.id))
    .where(inArray(matchesTable.venueName, venueNames))
    .groupBy(matchesTable.venueName);
  const byVenue = new Map<string, { average: number; count: number }>(aggregates.map((entry: { venueName: string; average: number; count: number }) => [entry.venueName, { average: Number(entry.average), count: Number(entry.count) }]));
  return rows.map((row) => {
    const rating = byVenue.get(row.venueName);
    return { ...toMatch(row), pitchRatingAverage: rating?.average ?? null, pitchRatingCount: rating?.count ?? 0 };
  });
}

async function getRefereeAssignment(userId: string | null | undefined) {
  if (!userId) return { refereeUserId: null, refereeName: null, refereeAvatarUrl: null, refereeAssignmentStatus: null };
  if (!(await isMatchStaffUser(userId))) throw new Error("Choose an account approved for match staff.");
  const user = await clerkClient.users.getUser(userId);
  return { refereeUserId: user.id, refereeName: user.fullName ?? user.firstName ?? "Match referee", refereeAvatarUrl: user.imageUrl || null, refereeAssignmentStatus: "pending" as const };
}

async function canControlLiveMatch(userId: string, refereeUserId: string | null, refereeAssignmentStatus: string | null): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  return refereeUserId === userId && refereeAssignmentStatus === "accepted" && await isMatchStaffUser(userId);
}

function teamForRegistration(player: { pitchSlot: number | null; liveTeam?: string | null }, index: number, players: Array<{ pitchSlot: number | null; liveTeam?: string | null }>, capacity: number): "red" | "blue" {
  if (player.liveTeam === "red" || player.liveTeam === "blue") return player.liveTeam;
  return player.pitchSlot == null
    ? index < Math.ceil(players.length / 2) ? "red" : "blue"
    : player.pitchSlot < Math.ceil(capacity / 2) ? "red" : "blue";
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function balancePlayersByAge<T extends { userId: string; age: number | null }>(players: T[]): Array<{ userId: string; team: "red" | "blue" }> {
  const groups = new Map<string, T[]>();
  for (const player of players) {
    const key = player.age == null ? "unknown" : String(player.age);
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  let redCount = 0;
  let blueCount = 0;
  const assignments: Array<{ userId: string; team: "red" | "blue" }> = [];
  for (const [, group] of orderedGroups) {
    const split = shuffled(group);
    let redInGroup = Math.floor(split.length / 2);
    let blueInGroup = Math.floor(split.length / 2);
    if (split.length % 2) {
      if (redCount < blueCount || (redCount === blueCount && Math.random() < 0.5)) redInGroup += 1;
      else blueInGroup += 1;
    }
    const redPlayers = shuffled(split).slice(0, redInGroup);
    const redIds = new Set(redPlayers.map(player => player.userId));
    for (const player of split) assignments.push({ userId: player.userId, team: redIds.has(player.userId) ? "red" : "blue" });
    redCount += redInGroup;
    blueCount += blueInGroup;
  }
  return assignments;
}

function resultForTeam(team: "red" | "blue", redScore: number, blueScore: number): "wins" | "draws" | "losses" {
  if (redScore === blueScore) return "draws";
  return (team === "red") === (redScore > blueScore) ? "wins" : "losses";
}

async function getLiveMatchSnapshot(matchId: string) {
  const [match] = await db.select({
    id: matchesTable.id,
    status: matchesTable.status,
    venueName: matchesTable.venueName,
    neighborhood: matchesTable.neighborhood,
    startsAt: matchesTable.startsAt,
    durationMinutes: matchesTable.durationMinutes,
    capacity: matchesTable.capacity,
    refereeUserId: matchesTable.refereeUserId,
    refereeName: matchesTable.refereeName,
    refereeAvatarUrl: matchesTable.refereeAvatarUrl,
    liveStatus: matchesTable.liveStatus,
    teamsGeneratedAt: matchesTable.teamsGeneratedAt,
    liveStartedAt: matchesTable.liveStartedAt,
    livePhaseStartedAt: matchesTable.livePhaseStartedAt,
    liveFirstHalfEndedAt: matchesTable.liveFirstHalfEndedAt,
    liveSecondHalfStartedAt: matchesTable.liveSecondHalfStartedAt,
    liveEndedAt: matchesTable.liveEndedAt,
    updatedAt: matchesTable.updatedAt,
  }).from(matchesTable).where(eq(matchesTable.id, matchId)).limit(1);
  if (!match) return null;
  const events = await db.select().from(matchEventsTable)
    .where(and(eq(matchEventsTable.matchId, matchId), isNull(matchEventsTable.voidedAt)))
    .orderBy(asc(matchEventsTable.createdAt));
  const registrations = await db.select({ userId: registrationsTable.userId, firstName: registrationsTable.firstName, avatarUrl: registrationsTable.avatarUrl, pitchSlot: registrationsTable.pitchSlot, liveTeam: registrationsTable.liveTeam, status: registrationsTable.status })
    .from(registrationsTable)
    .where(and(eq(registrationsTable.matchId, matchId), sql`${registrationsTable.status} IN ('joined', 'checked_in')`))
    .orderBy(asc(registrationsTable.pitchSlot), asc(registrationsTable.createdAt));
  const players = registrations.filter(player => player.status === "checked_in");
  const goals = events.filter((event) => event.type === "goal");
  const redScore = goals.filter((event) => event.team === "red").length;
  const blueScore = goals.filter((event) => event.team === "blue").length;
  return {
    id: match.id,
    matchStatus: match.status,
    venueName: match.venueName,
    neighborhood: match.neighborhood,
    startsAt: match.startsAt,
    durationMinutes: match.durationMinutes,
    capacity: match.capacity,
    refereeUserId: match.refereeUserId,
    refereeName: match.refereeName,
    refereeAvatarUrl: match.refereeAvatarUrl,
    liveStatus: match.liveStatus,
    teamsGeneratedAt: match.teamsGeneratedAt,
    liveStartedAt: match.liveStartedAt,
    livePhaseStartedAt: match.livePhaseStartedAt,
    liveFirstHalfEndedAt: match.liveFirstHalfEndedAt,
    liveSecondHalfStartedAt: match.liveSecondHalfStartedAt,
    liveEndedAt: match.liveEndedAt,
    registeredCount: registrations.length,
    checkedInCount: players.length,
    score: { red: redScore, blue: blueScore },
    players: players.map((player, index) => ({ ...player, team: teamForRegistration(player, index, players, match.capacity) })),
    events: events.map((event) => ({ id: event.id, clientEventId: event.clientEventId, type: event.type, team: event.team, period: event.period, minute: event.minute, scorerUserId: event.scorerUserId, scorerName: event.scorerName, assistUserId: event.assistUserId, assistName: event.assistName, suspensionMinutes: event.suspensionMinutes, occurredAt: event.occurredAt, createdAt: event.createdAt })),
    updatedAt: match.updatedAt,
  };
}

async function sendPushToUsers(userIds: string[], title: string, body: string, data: Record<string, string>): Promise<void> {
  if (!userIds.length) return;
  const tokens = await db.select().from(pushTokensTable).where(inArray(pushTokensTable.userId, userIds));
  if (!tokens.length) return;
  for (let offset = 0; offset < tokens.length; offset += 100) {
    const batch = tokens.slice(offset, offset + 100);
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
        body: JSON.stringify(batch.map(({ expoPushToken }) => ({ to: expoPushToken, title, body, data, sound: "default", channelId: "match-updates" }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
      const stale = batch.filter((_, index) => result.data?.[index]?.details?.error === "DeviceNotRegistered");
      for (const entry of stale) await db.delete(pushTokensTable).where(eq(pushTokensTable.expoPushToken, entry.expoPushToken));
    } catch {
      // In-app notifications remain available if Expo's push service is temporarily unreachable.
    }
  }
}

async function sendPushToUser(userId: string, title: string, body: string, data: Record<string, string>): Promise<void> {
  await sendPushToUsers([userId], title, body, data);
}

async function getMatchAlertRecipientIds(): Promise<string[]> {
  const subscriptions = await db.select({ userId: matchAlertSubscriptionsTable.userId }).from(matchAlertSubscriptionsTable);
  return subscriptions.map(({ userId }) => userId);
}

function getNewMatchMessage(match: { venueName: string; neighborhood: string; startsAt: Date; priceHalalas: number }): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(match.startsAt);
  const price = match.priceHalalas === 0 ? "Free" : `SAR ${(match.priceHalalas / 100).toFixed(2)}`;
  return `New match at ${match.venueName}, ${match.neighborhood} · ${time} Riyadh · ${price} per player.`;
}

function refereeMatchMessage(venueName: string, startsAt: Date): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(startsAt);
  return `Referee request for ${venueName} · ${time} Riyadh. Open Live match controls to respond.`;
}

async function notifyAdminsOfRefereeApplication(matchId: string, venueName: string, refereeName: string): Promise<void> {
  const grants = await db.select({ email: adminAccessTable.email }).from(adminAccessTable);
  const emails = [...new Set([OWNER_EMAIL, ...grants.map((grant) => grant.email)])];
  const accounts = await Promise.all(emails.map(async (email) => {
    const result = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
    return result.data.find((user) => user.emailAddresses.some((address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === email))?.id;
  }));
  const userIds = [...new Set(accounts.filter((id): id is string => Boolean(id)))];
  const message = `${refereeName} applied to referee ${venueName}. Review the request in the admin console.`;
  for (let offset = 0; offset < userIds.length; offset += 100) {
    await db.insert(notificationsTable).values(userIds.slice(offset, offset + 100).map((userId) => ({ userId, matchId, kind: "referee_application", message })));
  }
  void sendPushToUsers(userIds, "Referee application received", message, { matchId, screen: "admin" }).catch(() => undefined);
}

async function notifyRefereeOfAssignment(userId: string, match: { id: string; venueName: string; startsAt: Date }): Promise<void> {
  const message = refereeMatchMessage(match.venueName, match.startsAt);
  await db.insert(notificationsTable).values({ userId, matchId: match.id, kind: "referee_assignment", message });
  void sendPushToUser(userId, "Referee request", message, { matchId: match.id, screen: "referee-matches" }).catch(() => undefined);
}

async function notifyAdminsRefereeConfirmed(matchId: string, venueName: string, refereeName: string): Promise<void> {
  const grants = await db.select({ email: adminAccessTable.email }).from(adminAccessTable);
  const emails = [...new Set([OWNER_EMAIL, ...grants.map((grant) => grant.email)])];
  const accounts = await Promise.all(emails.map(async (email) => {
    const result = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
    return result.data.find((user) => user.emailAddresses.some((address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === email))?.id;
  }));
  const userIds = [...new Set(accounts.filter((id): id is string => Boolean(id)))];
  const message = `${refereeName} confirmed availability for ${venueName}. Confirm the referee assignment in the admin console.`;
  for (let offset = 0; offset < userIds.length; offset += 100) {
    await db.insert(notificationsTable).values(userIds.slice(offset, offset + 100).map((userId) => ({ userId, matchId, kind: "referee_confirmation", message })));
  }
  void sendPushToUsers(userIds, "Referee confirmed availability", message, { matchId, screen: "admin" }).catch(() => undefined);
}

async function expireWaitlistOffers(): Promise<void> {
  const now = new Date();
  const expired = await db.select().from(registrationsTable).where(and(eq(registrationsTable.status, "offered"), lt(registrationsTable.offerExpiresAt, now)));
  for (const entry of expired) {
    const promotedUserId = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, entry.matchId)).for("update").limit(1);
    const [stillExpired] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.id, entry.id), eq(registrationsTable.status, "offered"), lt(registrationsTable.offerExpiresAt, new Date()))).for("update").limit(1);
    if (!match || !stillExpired) return null;
    await tx.update(registrationsTable).set({ status: "cancelled", offerExpiresAt: null, updatedAt: new Date() }).where(eq(registrationsTable.id, entry.id));
    const [next] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "waitlisted"))).orderBy(asc(registrationsTable.createdAt)).for("update").limit(1);
    if (next) {
      const offerExpiresAt = new Date(Date.now() + WAITLIST_OFFER_TTL_MS);
      await tx.update(registrationsTable).set({ status: "offered", offerExpiresAt, updatedAt: new Date() }).where(eq(registrationsTable.id, next.id));
      await tx.insert(notificationsTable).values({ userId: next.userId, matchId: match.id, kind: "waitlist_offer", message: `A place is available at ${match.venueName}. Accept within 10 minutes.` });
      return next.userId;
    }
    await tx.update(matchesTable).set({ bookedCount: Math.max(0, match.bookedCount - 1), updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
    return null;
    });
    if (promotedUserId) await sendPushToUser(promotedUserId, "A place just opened", "Your waitlist offer expires in 10 minutes.", { matchId: entry.matchId, screen: "my-matches" });
  }
}

router.get("/me", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const user = await clerkClient.users.getUser(userId);
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      email,
      name: user.fullName ?? user.firstName ?? email,
      isAdmin: await isAdminUser(userId),
      isOwner: await isOwnerUser(userId),
      isPitchOwner: await isPitchOwnerUser(userId),
    }),
  );
});

router.get("/me/preferred-position", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [profile] = await db.select({ preferredPosition: playerProfilesTable.preferredPosition })
    .from(playerProfilesTable).where(eq(playerProfilesTable.userId, userId)).limit(1);
  res.json({ preferredPosition: profile?.preferredPosition ?? null });
});

router.patch("/me/preferred-position", requireAuth, async (req, res): Promise<void> => {
  const preferredPosition = req.body?.preferredPosition;
  if (!["striker", "defender", "midfielder", "winger"].includes(preferredPosition)) {
    res.status(400).json({ error: "Choose striker, defender, midfielder, or winger." }); return;
  }
  const userId = res.locals.userId as string;
  const [profile] = await db.insert(playerProfilesTable).values({ userId, preferredPosition, updatedAt: new Date() })
    .onConflictDoUpdate({ target: playerProfilesTable.userId, set: { preferredPosition, updatedAt: new Date() } })
    .returning({ preferredPosition: playerProfilesTable.preferredPosition });
  res.json(profile);
});

router.get("/me/age", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [profile] = await db.select({ age: playerProfilesTable.age }).from(playerProfilesTable).where(eq(playerProfilesTable.userId, userId)).limit(1);
  res.json({ age: profile?.age ?? null });
});

router.patch("/me/age", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const age = Number(req.body?.age);
  const guardianAcknowledged = req.body?.guardianAcknowledged === true;
  if (!Number.isInteger(age) || age < 13 || age > 120) { res.status(400).json({ error: "Enter an age from 13 to 120." }); return; }
  if (age < 18 && !guardianAcknowledged) { res.status(400).json({ error: "A parent or guardian must give permission for players under 18." }); return; }
  const [existing] = await db.select({ preferredPosition: playerProfilesTable.preferredPosition }).from(playerProfilesTable).where(eq(playerProfilesTable.userId, userId)).limit(1);
  const [profile] = await db.insert(playerProfilesTable).values({ userId, preferredPosition: existing?.preferredPosition ?? "striker", age, guardianConsentAttestedAt: age < 18 ? new Date() : null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: playerProfilesTable.userId, set: { age, guardianConsentAttestedAt: age < 18 ? new Date() : null, updatedAt: new Date() } })
    .returning({ age: playerProfilesTable.age });
  res.json(profile);
});

router.get("/me/match-staff", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  res.json({ isStaff: (await isAdminUser(userId)) || (await isMatchStaffUser(userId)) || (await isPitchOwnerUser(userId)) });
});

router.post("/me/push-token", requireAuth, async (req, res): Promise<void> => {
  const token = req.body?.token;
  const platform = req.body?.platform;
  if (typeof token !== "string" || !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || !["ios", "android"].includes(platform)) {
    res.status(400).json({ error: "A valid Expo push token and mobile platform are required." }); return;
  }
  const userId = res.locals.userId as string;
  await db.insert(pushTokensTable).values({ userId, expoPushToken: token, platform }).onConflictDoUpdate({ target: pushTokensTable.expoPushToken, set: { userId, platform, updatedAt: new Date() } });
  res.status(201).json({ registered: true });
});

router.get("/me/match-alerts", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [subscription] = await db.select({ userId: matchAlertSubscriptionsTable.userId })
    .from(matchAlertSubscriptionsTable)
    .where(eq(matchAlertSubscriptionsTable.userId, userId))
    .limit(1);
  res.json({ enabled: Boolean(subscription) });
});

router.post("/me/match-alerts", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await db.insert(matchAlertSubscriptionsTable)
    .values({ userId })
    .onConflictDoNothing({ target: matchAlertSubscriptionsTable.userId });
  res.status(201).json({ enabled: true });
});

router.delete("/me/match-alerts", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  await db.delete(matchAlertSubscriptionsTable).where(eq(matchAlertSubscriptionsTable.userId, userId));
  res.sendStatus(204);
});

router.delete("/me/push-token", requireAuth, async (req, res): Promise<void> => {
  const token = req.body?.token;
  if (typeof token !== "string") { res.status(400).json({ error: "Push token is required." }); return; }
  await db.delete(pushTokensTable).where(and(eq(pushTokensTable.userId, res.locals.userId as string), eq(pushTokensTable.expoPushToken, token)));
  res.sendStatus(204);
});

router.get("/matches", async (req, res): Promise<void> => {
  await expireWaitlistOffers();
  const now = new Date();
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from >= to)) {
    res.status(400).json({ error: "Use valid from and to dates, with from before to." });
    return;
  }
  const rows = await db
    .select()
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.status, "published"),
        gt(matchesTable.startsAt, now),
        sql`${matchesTable.bookedCount} < ${matchesTable.capacity}`,
      ),
    )
    .orderBy(asc(matchesTable.startsAt));

  const neighborhood = typeof req.query.neighborhood === "string" ? req.query.neighborhood.trim().toLowerCase() : "";
  const filtered = rows.filter((row) =>
    (!from || row.startsAt >= from) && (!to || row.startsAt < to) &&
    (!neighborhood || row.neighborhood.toLowerCase() === neighborhood)
  );
  res.json(ListMatchesResponse.parse(await addPitchRatings(filtered)));
});

router.get("/matches/:id/participants", async (req, res): Promise<void> => {
  const [match] = await db.select({ id: matchesTable.id, liveStatus: matchesTable.liveStatus }).from(matchesTable).where(and(eq(matchesTable.id, paramId(req.params.id)), or(eq(matchesTable.status, "published"), eq(matchesTable.liveStatus, "full_time")))).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  const rows = await db.select({ userId: registrationsTable.userId, firstName: registrationsTable.firstName, avatarUrl: registrationsTable.avatarUrl, pitchSlot: registrationsTable.pitchSlot, positionPreference: registrationsTable.positionPreference })
    .from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).orderBy(asc(registrationsTable.createdAt));
  res.json(rows);
});

router.get("/me/referee-matches", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const admin = await isAdminUser(userId);
  if (!admin && !(await isMatchStaffUser(userId))) { res.json([]); return; }
  const now = Date.now();
  const rows = await db.select().from(matchesTable)
    .where(and(eq(matchesTable.status, "published"), gt(matchesTable.startsAt, new Date(now - 8 * 60 * 60_000))))
    .orderBy(asc(matchesTable.startsAt));
  const applications = await db.select({ matchId: refereeMatchApplicationsTable.matchId, status: refereeMatchApplicationsTable.status })
    .from(refereeMatchApplicationsTable).where(eq(refereeMatchApplicationsTable.refereeUserId, userId));
  const applicationStatusByMatch = new Map(applications.map((application) => [application.matchId, application.status]));
  const assignedMatches = rows.filter((match) => match.refereeUserId === userId && match.liveStatus !== "full_time")
    .map((match) => ({ id: match.id, venueName: match.venueName, neighborhood: match.neighborhood, startsAt: match.startsAt, durationMinutes: match.durationMinutes, liveStatus: match.liveStatus, refereeName: match.refereeName, assignmentStatus: match.refereeAssignmentStatus ?? "accepted", canRespond: match.refereeAssignmentStatus === "pending", canApply: false, applicationStatus: applicationStatusByMatch.get(match.id) ?? null, kind: "assignment" }));
  const adminMatches = admin ? rows.filter((match) => match.refereeUserId && match.refereeUserId !== userId && match.liveStatus !== "full_time")
    .map((match) => ({ id: match.id, venueName: match.venueName, neighborhood: match.neighborhood, startsAt: match.startsAt, durationMinutes: match.durationMinutes, liveStatus: match.liveStatus, refereeName: match.refereeName, assignmentStatus: match.refereeAssignmentStatus ?? "accepted", canRespond: false, canApply: false, applicationStatus: null, kind: "assignment" })) : [];
  const openMatches = rows.filter((match) => match.status === "published" && match.refereeIncluded && !match.refereeUserId && match.startsAt > new Date() && match.liveStatus === "scheduled")
    .map((match) => ({ id: match.id, venueName: match.venueName, neighborhood: match.neighborhood, startsAt: match.startsAt, durationMinutes: match.durationMinutes, liveStatus: match.liveStatus, refereeName: null, assignmentStatus: null, canRespond: false, canApply: applicationStatusByMatch.get(match.id) !== "pending" && applicationStatusByMatch.get(match.id) !== "invited" && applicationStatusByMatch.get(match.id) !== "confirmed", applicationStatus: applicationStatusByMatch.get(match.id) ?? null, kind: "available" }));
  res.json([...assignedMatches, ...adminMatches, ...openMatches].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()));
});

router.post("/me/referee-applications", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const params = GetMatchParams.safeParse({ id: req.body?.matchId });
  if (!params.success) { res.status(400).json({ error: "Choose a valid match to apply for." }); return; }
  if (!(await isMatchStaffUser(userId))) { res.status(403).json({ error: "An approved referee account is required to apply." }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, params.data.id), eq(matchesTable.status, "published"), eq(matchesTable.refereeIncluded, true), isNull(matchesTable.refereeUserId), gt(matchesTable.startsAt, new Date()))).limit(1);
  if (!match) { res.status(409).json({ error: "This match is no longer open for referee applications." }); return; }
  const [existing] = await db.select().from(refereeMatchApplicationsTable).where(and(eq(refereeMatchApplicationsTable.matchId, match.id), eq(refereeMatchApplicationsTable.refereeUserId, userId))).limit(1);
  if (existing && ["pending", "invited", "confirmed"].includes(existing.status)) { res.status(200).json({ id: existing.id, status: existing.status }); return; }
  const now = new Date();
  const [application] = existing
    ? await db.update(refereeMatchApplicationsTable).set({ status: "pending", updatedAt: now }).where(eq(refereeMatchApplicationsTable.id, existing.id)).returning()
    : await db.insert(refereeMatchApplicationsTable).values({ matchId: match.id, refereeUserId: userId, status: "pending" }).returning();
  const referee = await clerkClient.users.getUser(userId);
  void notifyAdminsOfRefereeApplication(match.id, match.venueName, referee.fullName ?? referee.firstName ?? "A referee").catch(() => undefined);
  res.status(201).json({ id: application.id, status: application.status });
});

router.patch("/me/referee-matches/:id/decision", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  const userId = res.locals.userId as string;
  const decision = req.body?.decision;
  if (!params.success || !["accept", "decline"].includes(decision)) { res.status(400).json({ error: "Choose accept or decline for a valid referee assignment." }); return; }
  if (!(await isMatchStaffUser(userId))) { res.status(403).json({ error: "This account is not approved to referee matches." }); return; }
  const [match] = await db.select({ id: matchesTable.id, venueName: matchesTable.venueName, startsAt: matchesTable.startsAt, refereeUserId: matchesTable.refereeUserId, refereeName: matchesTable.refereeName, assignmentStatus: matchesTable.refereeAssignmentStatus })
    .from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match || match.refereeUserId !== userId) { res.status(404).json({ error: "This referee assignment is unavailable." }); return; }
  if (match.assignmentStatus !== "pending") { res.status(409).json({ error: "This referee assignment has already been answered." }); return; }
  const [updated] = await db.update(matchesTable).set(decision === "accept"
    ? { refereeAssignmentStatus: "referee_confirmed", updatedAt: new Date() }
    : { refereeUserId: null, refereeName: null, refereeAvatarUrl: null, refereeAssignmentStatus: "declined", updatedAt: new Date() })
    .where(and(eq(matchesTable.id, match.id), eq(matchesTable.refereeUserId, userId), eq(matchesTable.refereeAssignmentStatus, "pending"))).returning({ id: matchesTable.id });
  if (!updated) { res.status(409).json({ error: "This referee assignment has already changed." }); return; }
  if (decision === "accept") {
    await db.update(refereeMatchApplicationsTable).set({ status: "confirmed", updatedAt: new Date() }).where(and(eq(refereeMatchApplicationsTable.matchId, match.id), eq(refereeMatchApplicationsTable.refereeUserId, userId), eq(refereeMatchApplicationsTable.status, "invited")));
    void notifyAdminsRefereeConfirmed(match.id, match.venueName, match.refereeName ?? "The referee").catch(() => undefined);
  } else {
    await db.update(refereeMatchApplicationsTable).set({ status: "declined", updatedAt: new Date() }).where(and(eq(refereeMatchApplicationsTable.matchId, match.id), eq(refereeMatchApplicationsTable.refereeUserId, userId), eq(refereeMatchApplicationsTable.status, "invited")));
  }
  res.json({ id: updated.id, assignmentStatus: decision === "accept" ? "referee_confirmed" : "declined" });
});

router.patch("/admin/matches/:id/referee-assignment", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Choose a valid match." }); return; }
  if (req.body?.action !== "confirm") { res.status(400).json({ error: "Choose confirm to finalize the referee assignment." }); return; }
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match || !match.refereeUserId || match.refereeAssignmentStatus !== "referee_confirmed") { res.status(409).json({ error: "The referee must first confirm availability before you can finalize the assignment." }); return; }
  const [updated] = await db.update(matchesTable).set({ refereeAssignmentStatus: "accepted", updatedAt: new Date() })
    .where(and(eq(matchesTable.id, match.id), eq(matchesTable.refereeUserId, match.refereeUserId), eq(matchesTable.refereeAssignmentStatus, "referee_confirmed"))).returning({ id: matchesTable.id });
  if (!updated) { res.status(409).json({ error: "This referee assignment has already changed." }); return; }
  await db.update(refereeMatchApplicationsTable).set({ status: "confirmed", updatedAt: new Date() })
    .where(and(eq(refereeMatchApplicationsTable.matchId, match.id), eq(refereeMatchApplicationsTable.refereeUserId, match.refereeUserId), eq(refereeMatchApplicationsTable.status, "confirmed")));
  const message = `Your referee assignment for ${match.venueName} is confirmed. We'll remind you before kickoff.`;
  await db.insert(notificationsTable).values({ userId: match.refereeUserId, matchId: match.id, kind: "referee_assignment_confirmed", message });
  void sendPushToUser(match.refereeUserId, "Referee assignment confirmed", message, { matchId: match.id, screen: "referee-matches" }).catch(() => undefined);
  res.json({ id: updated.id, assignmentStatus: "accepted" });
});

router.get("/admin/referee-applications", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const applications = await db.select({ application: refereeMatchApplicationsTable, match: matchesTable })
    .from(refereeMatchApplicationsTable).innerJoin(matchesTable, eq(refereeMatchApplicationsTable.matchId, matchesTable.id))
    .where(eq(refereeMatchApplicationsTable.status, "pending")).orderBy(asc(refereeMatchApplicationsTable.createdAt)).limit(100);
  const applicationItems = await Promise.all(applications.map(async ({ application, match }) => {
    let userName = "Match referee"; let avatarUrl: string | null = null; let email = "";
    try { const user = await clerkClient.users.getUser(application.refereeUserId); userName = user.fullName ?? user.firstName ?? userName; avatarUrl = user.imageUrl || null; email = user.emailAddresses.find((entry) => entry.verification?.status === "verified")?.emailAddress ?? ""; } catch { /* keep the safe fallback */ }
    return { id: application.id, matchId: match.id, refereeUserId: application.refereeUserId, refereeName: userName, refereeEmail: email, refereeAvatarUrl: avatarUrl, venueName: match.venueName, neighborhood: match.neighborhood, startsAt: match.startsAt, status: application.status };
  }));
  const assignments = await db.select().from(matchesTable).where(and(isNotNull(matchesTable.refereeUserId), gt(matchesTable.startsAt, new Date(Date.now() - 8 * 60 * 60_000)), or(eq(matchesTable.refereeAssignmentStatus, "pending"), eq(matchesTable.refereeAssignmentStatus, "referee_confirmed"), eq(matchesTable.refereeAssignmentStatus, "accepted"))))
    .orderBy(asc(matchesTable.startsAt)).limit(100);
  res.json({ applications: applicationItems, assignments: assignments.map((match) => ({ matchId: match.id, venueName: match.venueName, neighborhood: match.neighborhood, startsAt: match.startsAt, refereeUserId: match.refereeUserId, refereeName: match.refereeName, assignmentStatus: match.refereeAssignmentStatus })) });
});

router.patch("/admin/referee-applications/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  const action = req.body?.action;
  if (!GetMatchParams.safeParse({ id }).success || !["invite", "reject"].includes(action)) { res.status(400).json({ error: "Choose a valid referee application and review action." }); return; }
  const [application] = await db.select().from(refereeMatchApplicationsTable).where(eq(refereeMatchApplicationsTable.id, id)).limit(1);
  if (!application || application.status !== "pending") { res.status(409).json({ error: "This referee application is no longer pending." }); return; }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, application.matchId), eq(matchesTable.status, "published"), eq(matchesTable.refereeIncluded, true), isNull(matchesTable.refereeUserId), gt(matchesTable.startsAt, new Date()))).limit(1);
  if (!match) { res.status(409).json({ error: "This match already has a referee or is no longer available." }); return; }
  if (action === "reject") {
    await db.update(refereeMatchApplicationsTable).set({ status: "rejected", updatedAt: new Date() }).where(and(eq(refereeMatchApplicationsTable.id, application.id), eq(refereeMatchApplicationsTable.status, "pending")));
    res.json({ status: "rejected" }); return;
  }
  let referee;
  try { referee = await getRefereeAssignment(application.refereeUserId); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "This referee account is no longer approved." }); return; }
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(matchesTable).where(eq(matchesTable.id, match.id)).for("update").limit(1);
    const [pendingApplication] = await tx.select().from(refereeMatchApplicationsTable).where(eq(refereeMatchApplicationsTable.id, application.id)).for("update").limit(1);
    if (!locked || locked.refereeUserId || !pendingApplication || pendingApplication.status !== "pending") return null;
    const [updatedMatch] = await tx.update(matchesTable).set({ ...referee, updatedAt: new Date() }).where(and(eq(matchesTable.id, match.id), isNull(matchesTable.refereeUserId))).returning();
    const [updatedApplication] = await tx.update(refereeMatchApplicationsTable).set({ status: "invited", updatedAt: new Date() }).where(and(eq(refereeMatchApplicationsTable.id, application.id), eq(refereeMatchApplicationsTable.status, "pending"))).returning();
    return updatedMatch && updatedApplication ? updatedMatch : null;
  });
  if (!result) { res.status(409).json({ error: "This application or match has changed. Refresh and try again." }); return; }
  await notifyRefereeOfAssignment(application.refereeUserId, result);
  res.json({ status: "invited", message: "Application approved. Contact the referee to coordinate; the assignment becomes final only after they confirm and you confirm it here." });
});

router.get("/matches/:id/live", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "A valid match ID is required." }); return; }
  const snapshot = await getLiveMatchSnapshot(params.data.id);
  if (!snapshot) { res.status(404).json({ error: "Match not found." }); return; }
  if (snapshot.matchStatus !== "published" && snapshot.liveStatus !== "full_time") { res.status(404).json({ error: "This live match is unavailable." }); return; }
  if (snapshot.liveStatus === "scheduled" && !snapshot.refereeUserId) { res.status(404).json({ error: "This match has no live match setup." }); return; }
  res.setHeader("Cache-Control", "no-store");
  res.json(snapshot);
});

router.post("/matches/:id/live/teams/generate", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "A valid match ID is required." }); return; }
  const userId = res.locals.userId as string;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  if (!(await canControlLiveMatch(userId, match.refereeUserId, match.refereeAssignmentStatus))) { res.status(403).json({ error: "Only the assigned referee or an admin can balance teams." }); return; }
  if (match.liveStatus !== "scheduled") { res.status(409).json({ error: "Teams can only be generated before kick-off." }); return; }
  if (match.teamsGeneratedAt) { res.status(409).json({ error: "Teams have already been generated for this match." }); return; }
  const generated = await db.transaction(async tx => {
    const [lockedMatch] = await tx.select({ liveStatus: matchesTable.liveStatus, teamsGeneratedAt: matchesTable.teamsGeneratedAt }).from(matchesTable).where(eq(matchesTable.id, match.id)).for("update").limit(1);
    if (!lockedMatch || lockedMatch.liveStatus !== "scheduled") return "closed" as const;
    if (lockedMatch.teamsGeneratedAt) return "already_generated" as const;
    // Older referee sessions could have stored team assignments before the one-time lock existed.
    // Preserve those assignments and close the draw instead of silently reshuffling them.
    const [existingAssignment] = await tx.select({ userId: registrationsTable.userId }).from(registrationsTable)
      .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in"), isNotNull(registrationsTable.liveTeam))).limit(1);
    if (existingAssignment) {
      await tx.update(matchesTable).set({ teamsGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
      return "already_generated" as const;
    }
    const participants = await tx.select({ userId: registrationsTable.userId, age: playerProfilesTable.age })
      .from(registrationsTable)
      .leftJoin(playerProfilesTable, eq(playerProfilesTable.userId, registrationsTable.userId))
      .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in")));
    if (participants.length < 2) return "not_enough_players" as const;
    const assignments = balancePlayersByAge(participants);
    for (const assignment of assignments) {
      await tx.update(registrationsTable).set({ liveTeam: assignment.team, updatedAt: new Date() })
        .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, assignment.userId)));
    }
    await tx.update(matchesTable).set({ teamsGeneratedAt: new Date(), updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
    return "generated" as const;
  });
  if (generated === "already_generated") { res.status(409).json({ error: "Teams have already been generated for this match." }); return; }
  if (generated === "closed") { res.status(409).json({ error: "Teams can only be generated before kick-off." }); return; }
  if (generated === "not_enough_players") { res.status(409).json({ error: "Admit at least two players by QR before generating teams." }); return; }
  res.json(await getLiveMatchSnapshot(match.id));
});

router.patch("/matches/:id/live/teams/:playerId", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  const playerId = paramId(req.params.playerId).trim();
  const team = req.body?.team;
  if (!params.success || !playerId || playerId.length > 128 || !["red", "blue"].includes(team)) { res.status(400).json({ error: "Choose a valid player and team." }); return; }
  const userId = res.locals.userId as string;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  if (!(await canControlLiveMatch(userId, match.refereeUserId, match.refereeAssignmentStatus))) { res.status(403).json({ error: "Only the assigned referee or an admin can move players." }); return; }
  if (match.liveStatus === "full_time" || !match.teamsGeneratedAt) { res.status(409).json({ error: "Generate teams before moving an admitted player." }); return; }
  const [player] = await db.update(registrationsTable).set({ liveTeam: team, updatedAt: new Date() })
    .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, playerId), eq(registrationsTable.status, "checked_in")))
    .returning({ userId: registrationsTable.userId });
  if (!player) { res.status(404).json({ error: "That player is not registered for this match." }); return; }
  res.json(await getLiveMatchSnapshot(match.id));
});

router.get("/me/recent-matches", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const archiveAfter = new Date(Date.now() - MATCH_ARCHIVE_HOURS * 60 * 60_000);
  const rows = await db.selectDistinct({ matchId: registrationsTable.matchId, endedAt: matchesTable.liveEndedAt }).from(registrationsTable)
    .innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
    .where(and(
      eq(matchesTable.liveStatus, "full_time"),
      gt(matchesTable.liveEndedAt, archiveAfter),
      eq(registrationsTable.status, "checked_in"),
      or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)),
    ))
    .orderBy(desc(matchesTable.liveEndedAt)).limit(12);
  const ids = rows.map(row => row.matchId);
  const matchRows = ids.length ? await db.select({ id: matchesTable.id, venueName: matchesTable.venueName, neighborhood: matchesTable.neighborhood, imageUrl: matchesTable.imageUrl, imageUrls: matchesTable.imageUrls, startsAt: matchesTable.startsAt, durationMinutes: matchesTable.durationMinutes, liveEndedAt: matchesTable.liveEndedAt })
    .from(matchesTable).where(inArray(matchesTable.id, ids)) : [];
  const matchesById = new Map(matchRows.map(match => [match.id, match]));
  const orderedMatches = rows.map(row => matchesById.get(row.matchId)).filter((match): match is NonNullable<typeof match> => Boolean(match));
  const snapshots = await Promise.all(orderedMatches.map(async (match) => {
    const live = await getLiveMatchSnapshot(match.id);
    return live && match.liveEndedAt ? {
      match: { id: match.id, venueName: match.venueName, neighborhood: match.neighborhood, imageUrl: match.imageUrl, imageUrls: match.imageUrls, startsAt: match.startsAt, durationMinutes: match.durationMinutes },
      live,
      endedAt: match.liveEndedAt,
      expiresAt: new Date(match.liveEndedAt.getTime() + MATCH_ARCHIVE_HOURS * 60 * 60_000),
    } : null;
  }));
  res.setHeader("Cache-Control", "no-store");
  res.json(snapshots.filter(Boolean));
});

router.get("/me/match-history", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const offset = typeof _req.query.offset === "string" && /^\d+$/.test(_req.query.offset) ? Number(_req.query.offset) : 0;
  if (offset > 100_000) { res.status(400).json({ error: "Match history offset is too large." }); return; }
  const pageSize = 50;
  const rows = await db.selectDistinct({ matchId: registrationsTable.matchId, endedAt: matchesTable.liveEndedAt }).from(registrationsTable)
    .innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
    .where(and(
      eq(matchesTable.liveStatus, "full_time"),
      eq(registrationsTable.status, "checked_in"),
      or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)),
    ))
    .orderBy(desc(matchesTable.liveEndedAt)).limit(pageSize).offset(offset);
  const ids = rows.map(row => row.matchId);
  const matchRows = ids.length ? await db.select({ id: matchesTable.id, venueName: matchesTable.venueName, neighborhood: matchesTable.neighborhood, imageUrl: matchesTable.imageUrl, imageUrls: matchesTable.imageUrls, startsAt: matchesTable.startsAt, durationMinutes: matchesTable.durationMinutes, liveEndedAt: matchesTable.liveEndedAt })
    .from(matchesTable).where(inArray(matchesTable.id, ids)) : [];
  const matchesById = new Map(matchRows.map(match => [match.id, match]));
  const uniqueMatches = rows.map(row => matchesById.get(row.matchId)).filter((match): match is NonNullable<typeof match> => Boolean(match));
  const events = ids.length ? await db.select({ matchId: matchEventsTable.matchId, team: matchEventsTable.team, type: matchEventsTable.type })
    .from(matchEventsTable).where(and(inArray(matchEventsTable.matchId, ids), isNull(matchEventsTable.voidedAt))) : [];
  const scores = new Map<string, { red: number; blue: number; goals: number }>();
  for (const event of events) {
    if (event.type !== "goal") continue;
    const score = scores.get(event.matchId) ?? { red: 0, blue: 0, goals: 0 };
    score[event.team === "red" ? "red" : "blue"] += 1; score.goals += 1; scores.set(event.matchId, score);
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ items: uniqueMatches.map(match => ({
    match: { id: match.id, venueName: match.venueName, neighborhood: match.neighborhood, imageUrl: match.imageUrl, imageUrls: match.imageUrls, startsAt: match.startsAt, durationMinutes: match.durationMinutes },
    score: scores.get(match.id) ?? { red: 0, blue: 0, goals: 0 },
    endedAt: match.liveEndedAt,
  })), nextOffset: rows.length === pageSize ? offset + pageSize : null });
});

router.get("/players/:userId/profile", async (req, res): Promise<void> => {
  const userId = paramId(req.params.userId).trim();
  if (!userId || userId.length > 128) { res.status(400).json({ error: "Choose a valid player." }); return; }
  const [stats] = await db.select().from(playerCareerStatsTable).where(eq(playerCareerStatsTable.userId, userId)).limit(1);
  try {
    const user = await clerkClient.users.getUser(userId);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      userId,
      firstName: user.firstName ?? user.fullName?.split(" ")[0] ?? "Player",
      avatarUrl: user.imageUrl || null,
      matchesPlayed: stats?.matchesPlayed ?? 0,
      wins: stats?.wins ?? 0,
      draws: stats?.draws ?? 0,
      losses: stats?.losses ?? 0,
      goals: stats?.goals ?? 0,
      assists: stats?.assists ?? 0,
      yellowCards: stats?.yellowCards ?? 0,
      redCards: stats?.redCards ?? 0,
      fairPlayScore: stats && stats.matchesPlayed ? Math.round(stats.fairPlayPoints / stats.matchesPlayed) : null,
    });
  } catch {
    res.status(404).json({ error: "Player profile is unavailable." });
  }
});

router.post("/matches/:id/live/state", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "A valid match ID is required." }); return; }
  const userId = res.locals.userId as string;
  const [current] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!current) { res.status(404).json({ error: "Match not found." }); return; }
  if (!(await canControlLiveMatch(userId, current.refereeUserId, current.refereeAssignmentStatus))) { res.status(403).json({ error: "Only the assigned referee after accepting the assignment, or an admin, can control this match." }); return; }
  const action = req.body?.action;
  const now = new Date();
  if (action === "start_first_half") {
    const participants = await db.select({ userId: registrationsTable.userId, liveTeam: registrationsTable.liveTeam }).from(registrationsTable)
      .where(and(eq(registrationsTable.matchId, current.id), eq(registrationsTable.status, "checked_in")));
    if (!current.teamsGeneratedAt || participants.length < 2 || participants.some(player => player.liveTeam == null)) { res.status(409).json({ error: "Admit players by QR and generate teams once before starting the first half." }); return; }
  }
  const updated = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).for("update").limit(1);
    if (!match || match.status !== "published") return null;
    if (action === "start_first_half" && match.liveStatus === "scheduled") {
      const [row] = await tx.update(matchesTable).set({ liveStatus: "first_half", liveStartedAt: now, livePhaseStartedAt: now, updatedAt: now }).where(eq(matchesTable.id, match.id)).returning();
      return row;
    }
    if (action === "start_halftime" && match.liveStatus === "first_half") {
      const [row] = await tx.update(matchesTable).set({ liveStatus: "halftime", livePhaseStartedAt: null, liveFirstHalfEndedAt: now, updatedAt: now }).where(eq(matchesTable.id, match.id)).returning();
      return row;
    }
    if (action === "start_second_half" && match.liveStatus === "halftime") {
      const [row] = await tx.update(matchesTable).set({ liveStatus: "second_half", livePhaseStartedAt: now, liveSecondHalfStartedAt: now, updatedAt: now }).where(eq(matchesTable.id, match.id)).returning();
      return row;
    }
    if (action === "finish_match" && match.liveStatus === "second_half") {
      const participants = await tx.select({ userId: registrationsTable.userId, pitchSlot: registrationsTable.pitchSlot, liveTeam: registrationsTable.liveTeam }).from(registrationsTable)
        .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in")))
        .orderBy(asc(registrationsTable.pitchSlot), asc(registrationsTable.createdAt));
      const events = await tx.select().from(matchEventsTable)
        .where(and(eq(matchEventsTable.matchId, match.id), isNull(matchEventsTable.voidedAt)));
      const redScore = events.filter(event => event.type === "goal" && event.team === "red").length;
      const blueScore = events.filter(event => event.type === "goal" && event.team === "blue").length;
      for (const [index, player] of participants.entries()) {
        const goals = events.filter((event) => event.type === "goal" && event.scorerUserId === player.userId).length;
        const assists = events.filter((event) => event.type === "goal" && event.assistUserId === player.userId).length;
        const yellowCards = events.filter((event) => event.type === "yellow_card" && event.scorerUserId === player.userId).length;
        const redCards = events.filter((event) => event.scorerUserId === player.userId && (event.type === "red_card" || event.suspensionMinutes != null)).length;
        const fairPlayPoints = Math.max(0, 100 - yellowCards * 10 - redCards * 25);
        const playerTeam = teamForRegistration(player, index, participants, match.capacity);
        const wins = Number(redScore !== blueScore && ((playerTeam === "red") === (redScore > blueScore)));
        const draws = Number(redScore === blueScore);
        const losses = Number(redScore !== blueScore && ((playerTeam === "red") !== (redScore > blueScore)));
        await tx.insert(playerCareerStatsTable).values({ userId: player.userId, matchesPlayed: 1, wins, draws, losses, goals, assists, yellowCards, redCards, fairPlayPoints, updatedAt: now })
          .onConflictDoUpdate({ target: playerCareerStatsTable.userId, set: {
            matchesPlayed: sql`${playerCareerStatsTable.matchesPlayed} + 1`,
            wins: sql`${playerCareerStatsTable.wins} + ${wins}`,
            draws: sql`${playerCareerStatsTable.draws} + ${draws}`,
            losses: sql`${playerCareerStatsTable.losses} + ${losses}`,
            goals: sql`${playerCareerStatsTable.goals} + ${goals}`,
            assists: sql`${playerCareerStatsTable.assists} + ${assists}`,
            yellowCards: sql`${playerCareerStatsTable.yellowCards} + ${yellowCards}`,
            redCards: sql`${playerCareerStatsTable.redCards} + ${redCards}`,
            fairPlayPoints: sql`${playerCareerStatsTable.fairPlayPoints} + ${fairPlayPoints}`,
            updatedAt: now,
          } });
      }
      const [row] = await tx.update(matchesTable).set({ liveStatus: "full_time", livePhaseStartedAt: null, liveEndedAt: now, updatedAt: now }).where(eq(matchesTable.id, match.id)).returning();
      return row;
    }
    return undefined;
  });
  if (updated === undefined) { res.status(409).json({ error: "That match-day action is not available in the current phase." }); return; }
  if (!updated) { res.status(404).json({ error: "Published match not found." }); return; }
  res.json(await getLiveMatchSnapshot(updated.id));
});

router.post("/matches/:id/live/events", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "A valid match ID is required." }); return; }
  const userId = res.locals.userId as string;
  const { clientEventId, team, scorerUserId, assistUserId } = req.body ?? {};
  const eventType = req.body?.type ?? "goal";
  if (typeof clientEventId !== "string" || !clientEventId.trim() || clientEventId.length > 100 || !["red", "blue"].includes(team) || typeof scorerUserId !== "string" || !["goal", "yellow_card", "red_card"].includes(eventType) || (assistUserId != null && typeof assistUserId !== "string") || (eventType !== "goal" && assistUserId != null)) {
    res.status(400).json({ error: "Choose a team and player, and use a valid match event." }); return;
  }
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  if (match.status !== "published") { res.status(404).json({ error: "This match is not published." }); return; }
  if (!(await canControlLiveMatch(userId, match.refereeUserId, match.refereeAssignmentStatus))) { res.status(403).json({ error: "Only the assigned referee after accepting the assignment, or an admin, can record match events." }); return; }
  const [duplicate] = await db.select({ id: matchEventsTable.id }).from(matchEventsTable).where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.clientEventId, clientEventId))).limit(1);
  if (duplicate) { res.json(await getLiveMatchSnapshot(match.id)); return; }
  const occurredAt = typeof req.body?.occurredAt === "string" ? new Date(req.body.occurredAt) : new Date();
  const now = new Date();
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + 60_000 || !match.liveStartedAt || occurredAt < match.liveStartedAt || (match.liveEndedAt && occurredAt > match.liveEndedAt)) {
    res.status(400).json({ error: "This event time is outside the match." }); return;
  }
  const period = match.liveFirstHalfEndedAt && occurredAt > match.liveFirstHalfEndedAt
    ? match.liveSecondHalfStartedAt && occurredAt >= match.liveSecondHalfStartedAt ? 2 : 0
    : 1;
  const phaseStart = period === 1 ? match.liveStartedAt : match.liveSecondHalfStartedAt;
  if (!period || !phaseStart) { res.status(409).json({ error: "Events can only be recorded during a half, not during the break." }); return; }
  if (match.liveStatus === "scheduled" || (match.liveStatus === "halftime" && occurredAt >= (match.liveSecondHalfStartedAt ?? now)) || (match.liveStatus === "full_time" && (!match.liveEndedAt || occurredAt > match.liveEndedAt))) {
    res.status(409).json({ error: "The match is not in a playing phase." }); return;
  }
  const registrations = await db.select({ userId: registrationsTable.userId, firstName: registrationsTable.firstName, pitchSlot: registrationsTable.pitchSlot, liveTeam: registrationsTable.liveTeam })
    .from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in")))
    .orderBy(asc(registrationsTable.pitchSlot), asc(registrationsTable.createdAt));
  const scorer = registrations.find((player) => player.userId === scorerUserId);
  const assist = assistUserId ? registrations.find((player) => player.userId === assistUserId) : undefined;
  const getPlayerTeam = (player: typeof registrations[number]) => teamForRegistration(player, registrations.indexOf(player), registrations, match.capacity);
  if (!scorer || getPlayerTeam(scorer) !== team || (assistUserId && (!assist || assist.userId === scorer.userId || getPlayerTeam(assist) !== team))) {
    res.status(400).json({ error: "Choose a player and assist from the selected team." }); return;
  }
  const halfMinutes = Math.ceil(match.durationMinutes / 2);
  const minute = Math.max(1, (period === 2 ? halfMinutes : 0) + Math.ceil((occurredAt.getTime() - phaseStart.getTime()) / 60_000));
  const insertResult = await db.transaction(async (tx) => {
    const [lockedMatch] = await tx.select({ liveStatus: matchesTable.liveStatus, liveEndedAt: matchesTable.liveEndedAt })
      .from(matchesTable).where(eq(matchesTable.id, match.id)).for("update").limit(1);
    if (!lockedMatch) return { inserted: false, afterEnd: false };
    if (lockedMatch.liveStatus === "full_time" && (!lockedMatch.liveEndedAt || occurredAt > lockedMatch.liveEndedAt)) return { inserted: false, afterEnd: true };
    const activeSendingOffs = await tx.select({ occurredAt: matchEventsTable.occurredAt, suspensionMinutes: matchEventsTable.suspensionMinutes })
      .from(matchEventsTable)
      .where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.scorerUserId, scorer.userId), isNull(matchEventsTable.voidedAt), or(eq(matchEventsTable.type, "red_card"), sql`${matchEventsTable.suspensionMinutes} IS NOT NULL`)));
    const activeTimeout = activeSendingOffs.some(card => card.suspensionMinutes != null && card.occurredAt.getTime() + card.suspensionMinutes * 60_000 > occurredAt.getTime());
    if (activeTimeout) return { inserted: false, afterEnd: false, suspended: true };
    let suspensionMinutes: number | null = null;
    if (eventType === "yellow_card" || eventType === "red_card") {
      const previousCards = await tx.select({ type: matchEventsTable.type, suspensionMinutes: matchEventsTable.suspensionMinutes })
        .from(matchEventsTable).where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.scorerUserId, scorer.userId), isNull(matchEventsTable.voidedAt)))
        .orderBy(asc(matchEventsTable.occurredAt));
      let previousDismissals = 0; let previousYellows = 0;
      for (const card of previousCards) {
        if (card.type === "red_card" || card.suspensionMinutes != null) { previousDismissals += 1; previousYellows = 0; }
        else if (card.type === "yellow_card") previousYellows += 1;
      }
      if (eventType === "red_card" || (eventType === "yellow_card" && previousYellows >= 1)) suspensionMinutes = previousDismissals >= 1 ? 30 : 15;
    }
    const scoreEventsBefore = lockedMatch.liveStatus === "full_time" && eventType === "goal"
      ? await tx.select({ team: matchEventsTable.team }).from(matchEventsTable).where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.type, "goal"), isNull(matchEventsTable.voidedAt)))
      : [];
    const [inserted] = await tx.insert(matchEventsTable).values({ matchId: match.id, clientEventId: clientEventId.trim(), type: eventType, team, period, minute, scorerUserId: scorer.userId, scorerName: scorer.firstName, assistUserId: assist?.userId ?? null, assistName: assist?.firstName ?? null, suspensionMinutes, occurredAt, recordedByUserId: userId }).onConflictDoNothing({ target: [matchEventsTable.matchId, matchEventsTable.clientEventId] }).returning({ id: matchEventsTable.id });
    if (inserted && lockedMatch.liveStatus === "full_time") {
      if (eventType === "goal") {
        const beforeRed = scoreEventsBefore.filter(event => event.team === "red").length;
        const beforeBlue = scoreEventsBefore.filter(event => event.team === "blue").length;
        const afterRed = beforeRed + Number(team === "red");
        const afterBlue = beforeBlue + Number(team === "blue");
        const players = await tx.select({ userId: registrationsTable.userId, pitchSlot: registrationsTable.pitchSlot, liveTeam: registrationsTable.liveTeam }).from(registrationsTable)
          .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in")))
          .orderBy(asc(registrationsTable.pitchSlot), asc(registrationsTable.createdAt));
        for (const [index, player] of players.entries()) {
          const playerTeam = teamForRegistration(player, index, players, match.capacity);
          const previous = resultForTeam(playerTeam, beforeRed, beforeBlue);
          const next = resultForTeam(playerTeam, afterRed, afterBlue);
          if (previous === next) continue;
          const deltas = { wins: Number(next === "wins") - Number(previous === "wins"), draws: Number(next === "draws") - Number(previous === "draws"), losses: Number(next === "losses") - Number(previous === "losses") };
          await tx.update(playerCareerStatsTable).set({
            wins: sql`${playerCareerStatsTable.wins} + ${deltas.wins}`,
            draws: sql`${playerCareerStatsTable.draws} + ${deltas.draws}`,
            losses: sql`${playerCareerStatsTable.losses} + ${deltas.losses}`,
            updatedAt: now,
          }).where(eq(playerCareerStatsTable.userId, player.userId));
        }
      }
      let fairPlayDelta = 0;
      if (eventType === "yellow_card" || eventType === "red_card") {
        const oldCards = await tx.select({ type: matchEventsTable.type, suspensionMinutes: matchEventsTable.suspensionMinutes }).from(matchEventsTable)
          .where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.scorerUserId, scorer.userId), isNull(matchEventsTable.voidedAt)));
        const oldYellow = oldCards.filter(card => card.type === "yellow_card").length - Number(eventType === "yellow_card");
        const oldRed = oldCards.filter(card => card.type === "red_card" || card.suspensionMinutes != null).length - Number(suspensionMinutes != null);
        fairPlayDelta = Math.max(0, 100 - (oldYellow + Number(eventType === "yellow_card")) * 10 - (oldRed + Number(suspensionMinutes != null)) * 25) - Math.max(0, 100 - oldYellow * 10 - oldRed * 25);
      }
      await tx.update(playerCareerStatsTable).set({
        goals: sql`${playerCareerStatsTable.goals} + ${Number(eventType === "goal")}`,
        yellowCards: sql`${playerCareerStatsTable.yellowCards} + ${Number(eventType === "yellow_card")}`,
        redCards: sql`${playerCareerStatsTable.redCards} + ${Number(eventType === "red_card" || suspensionMinutes != null)}`,
        fairPlayPoints: sql`${playerCareerStatsTable.fairPlayPoints} + ${fairPlayDelta}`,
        updatedAt: now,
      }).where(eq(playerCareerStatsTable.userId, scorer.userId));
      if (assist) await tx.update(playerCareerStatsTable).set({ assists: sql`${playerCareerStatsTable.assists} + 1`, updatedAt: now }).where(eq(playerCareerStatsTable.userId, assist.userId));
    }
    return { inserted: Boolean(inserted), afterEnd: false };
  });
  if (insertResult.suspended) { res.status(409).json({ error: "That player is still serving a temporary red-card timeout." }); return; }
  if (insertResult.afterEnd) { res.status(400).json({ error: "This event happened after the match ended." }); return; }
  res.status(201).json(await getLiveMatchSnapshot(match.id));
});

router.delete("/matches/:id/live/events/:eventId", requireAuth, async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  const eventId = paramId(req.params.eventId);
  if (!params.success) { res.status(400).json({ error: "A valid match ID is required." }); return; }
  const userId = res.locals.userId as string;
  const [match] = await db.select().from(matchesTable).where(eq(matchesTable.id, params.data.id)).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  if (!(await canControlLiveMatch(userId, match.refereeUserId, match.refereeAssignmentStatus))) { res.status(403).json({ error: "Only the assigned referee after accepting the assignment, or an admin, can correct match events." }); return; }
  const voidedAt = new Date();
  const event = await db.transaction(async (tx) => {
    const [lockedMatch] = await tx.select({ liveStatus: matchesTable.liveStatus }).from(matchesTable)
      .where(eq(matchesTable.id, match.id)).for("update").limit(1);
    if (!lockedMatch) return null;
    const [current] = await tx.select().from(matchEventsTable).where(and(eq(matchEventsTable.id, eventId), eq(matchEventsTable.matchId, match.id), isNull(matchEventsTable.voidedAt))).for("update").limit(1);
    if (!current) return null;
    if (current.type === "yellow_card" && current.suspensionMinutes == null) {
      const [laterDismissal] = await tx.select({ id: matchEventsTable.id }).from(matchEventsTable)
        .where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.scorerUserId, current.scorerUserId), eq(matchEventsTable.type, "yellow_card"), sql`${matchEventsTable.suspensionMinutes} IS NOT NULL`, gt(matchEventsTable.occurredAt, current.occurredAt), isNull(matchEventsTable.voidedAt))).limit(1);
      if (laterDismissal) return { blockedBySecondYellow: true } as const;
    }
    const scoreEventsBefore = lockedMatch.liveStatus === "full_time" && current.type === "goal"
      ? await tx.select({ team: matchEventsTable.team }).from(matchEventsTable).where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.type, "goal"), isNull(matchEventsTable.voidedAt)))
      : [];
    let fairPlayDelta = 0;
    if (lockedMatch.liveStatus === "full_time" && (current.type === "yellow_card" || current.type === "red_card")) {
      const cards = await tx.select({ type: matchEventsTable.type, suspensionMinutes: matchEventsTable.suspensionMinutes }).from(matchEventsTable)
        .where(and(eq(matchEventsTable.matchId, match.id), eq(matchEventsTable.scorerUserId, current.scorerUserId), isNull(matchEventsTable.voidedAt)));
      const oldYellow = cards.filter(card => card.type === "yellow_card").length;
      const oldRed = cards.filter(card => card.type === "red_card" || card.suspensionMinutes != null).length;
      const wasDismissed = current.type === "red_card" || current.suspensionMinutes != null;
      fairPlayDelta = Math.max(0, 100 - (oldYellow - Number(current.type === "yellow_card")) * 10 - (oldRed - Number(wasDismissed)) * 25) - Math.max(0, 100 - oldYellow * 10 - oldRed * 25);
    }
    const [removed] = await tx.update(matchEventsTable).set({ voidedAt, voidedByUserId: userId })
      .where(eq(matchEventsTable.id, current.id)).returning({ id: matchEventsTable.id });
    if (removed && lockedMatch.liveStatus === "full_time") {
      if (current.type === "goal") {
        const beforeRed = scoreEventsBefore.filter(entry => entry.team === "red").length;
        const beforeBlue = scoreEventsBefore.filter(entry => entry.team === "blue").length;
        const afterRed = beforeRed - Number(current.team === "red");
        const afterBlue = beforeBlue - Number(current.team === "blue");
        const players = await tx.select({ userId: registrationsTable.userId, pitchSlot: registrationsTable.pitchSlot, liveTeam: registrationsTable.liveTeam }).from(registrationsTable)
          .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "checked_in")))
          .orderBy(asc(registrationsTable.pitchSlot), asc(registrationsTable.createdAt));
        for (const [index, player] of players.entries()) {
          const playerTeam = teamForRegistration(player, index, players, match.capacity);
          const previous = resultForTeam(playerTeam, beforeRed, beforeBlue);
          const next = resultForTeam(playerTeam, afterRed, afterBlue);
          if (previous === next) continue;
          const deltas = { wins: Number(next === "wins") - Number(previous === "wins"), draws: Number(next === "draws") - Number(previous === "draws"), losses: Number(next === "losses") - Number(previous === "losses") };
          await tx.update(playerCareerStatsTable).set({
            wins: sql`${playerCareerStatsTable.wins} + ${deltas.wins}`,
            draws: sql`${playerCareerStatsTable.draws} + ${deltas.draws}`,
            losses: sql`${playerCareerStatsTable.losses} + ${deltas.losses}`,
            updatedAt: voidedAt,
          }).where(eq(playerCareerStatsTable.userId, player.userId));
        }
      }
      await tx.update(playerCareerStatsTable).set({
        goals: sql`${playerCareerStatsTable.goals} - ${Number(current.type === "goal")}`,
        yellowCards: sql`${playerCareerStatsTable.yellowCards} - ${Number(current.type === "yellow_card")}`,
        redCards: sql`${playerCareerStatsTable.redCards} - ${Number(current.type === "red_card" || current.suspensionMinutes != null)}`,
        fairPlayPoints: sql`${playerCareerStatsTable.fairPlayPoints} + ${fairPlayDelta}`,
        updatedAt: voidedAt,
      }).where(eq(playerCareerStatsTable.userId, current.scorerUserId));
      if (current.assistUserId && current.type === "goal") await tx.update(playerCareerStatsTable).set({ assists: sql`${playerCareerStatsTable.assists} - 1`, updatedAt: voidedAt }).where(eq(playerCareerStatsTable.userId, current.assistUserId));
    }
    return removed ? { blockedBySecondYellow: false, id: removed.id } as const : null;
  });
  if (!event) { res.status(404).json({ error: "That event is already removed or could not be found." }); return; }
  if ("blockedBySecondYellow" in event && event.blockedBySecondYellow) { res.status(409).json({ error: "Undo the second-yellow sending-off first, then undo this earlier yellow card." }); return; }
  res.json(await getLiveMatchSnapshot(match.id));
});

router.post("/matches/:id/registrations", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const positionPreference = req.body?.positionPreference;
  const friendEmails = req.body?.friendEmails;
  const pitchSlots = req.body?.pitchSlots;
  const friendOnly = req.body?.friendOnly === true;
  if (!["anywhere", "goalkeeper", "defender", "midfielder", "attacker"].includes(positionPreference)) {
    res.status(400).json({ error: "Choose a valid position preference." }); return;
  }
  if (!Array.isArray(friendEmails) || friendEmails.length > (friendOnly ? 1 : 13) || friendEmails.some((email: unknown) => typeof email !== "string") || (friendOnly && friendEmails.length !== 1)) {
    res.status(400).json({ error: friendOnly ? "Add one friend at a time after booking your own place." : "Add up to 13 friends by email." }); return;
  }
  const normalizedEmails = friendEmails.map((email: string) => email.trim().toLowerCase());
  if (
    normalizedEmails.some((email: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    new Set(normalizedEmails).size !== normalizedEmails.length
  ) { res.status(400).json({ error: "Use a different, valid email for each friend." }); return; }
  if (
    !Array.isArray(pitchSlots) ||
    pitchSlots.length !== normalizedEmails.length + (friendOnly ? 0 : 1) ||
    pitchSlots.some((slot: unknown) => !Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= 14) ||
    new Set(pitchSlots).size !== pitchSlots.length
  ) { res.status(400).json({ error: "Choose one different open pitch spot per attendee." }); return; }

  const user = await clerkClient.users.getUser(userId);
  const friendUsers = normalizedEmails.length
    ? (await clerkClient.users.getUserList({ emailAddress: normalizedEmails, limit: 100 })).data
    : [];
  const attendees = friendOnly ? [] : [{
    userId,
    firstName: user.firstName || user.fullName?.split(" ")[0] || "Player",
    avatarUrl: user.imageUrl || null,
  }];
  for (const email of normalizedEmails) {
    const friend = friendUsers.find((candidate) =>
      candidate.emailAddresses.some((address) =>
        address.emailAddress.toLowerCase() === email && address.verification?.status === "verified",
      ),
    );
    if (!friend || friend.id === userId) {
      res.status(400).json({ error: "Each friend must have a different KICKOFF account with a verified email." }); return;
    }
    attendees.push({
      userId: friend.id,
      firstName: friend.firstName || friend.fullName?.split(" ")[0] || "Player",
      avatarUrl: friend.imageUrl || null,
    });
  }
  if (new Set(attendees.map((attendee) => attendee.userId)).size !== attendees.length) {
    res.status(400).json({ error: "Each ticket needs a different KICKOFF account." }); return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    if (!match || match.status !== "published" || match.startsAt <= new Date()) return { error: "Match is no longer available.", status: 404 } as const;
    if (friendOnly) {
      const [ownPlace] = await tx.select({ id: registrationsTable.id }).from(registrationsTable)
        .where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).limit(1);
      if (!ownPlace) return { error: "Book your own place before booking a friend." , status: 403 } as const;
    }
    if (pitchSlots.some((slot: number) => slot >= Math.min(match.capacity, 14))) return { error: "A selected pitch spot is outside this match's capacity.", status: 400 } as const;
    if (match.bookedCount + attendees.length > match.capacity) return { error: "There are not enough places left for everyone selected.", status: 409 } as const;
    if (!canConfirmPaidRegistration(match.priceHalalas, false)) return { error: "Paid booking is unavailable until the payment provider is configured. No seat has been held.", status: 503 } as const;
    const [goalkeepers] = await tx.select({ count: sql<number>`count(*)::int` }).from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`, eq(registrationsTable.positionPreference, "goalkeeper")));
    if (positionPreference === "goalkeeper" && (goalkeepers?.count ?? 0) >= 2) return { error: "The goalkeeper preference is full for this match.", status: 409 } as const;

    const checkinExpiresAt = getMatchEndAt(match.startsAt, match.durationMinutes);
    const existingRegistrations: Array<typeof registrationsTable.$inferSelect | undefined> = [];
    for (const [index, attendee] of attendees.entries()) {
      const [existing] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, attendee.userId))).limit(1);
      if (existing && ["joined", "checked_in", "waitlisted", "offered"].includes(existing.status)) {
        return { error: `${attendee.firstName} already has an active place for this match.`, status: 409 } as const;
      }
      const pitchSlot = pitchSlots[index] as number;
      const [occupiedPitchSlot] = await tx.select({ id: registrationsTable.id }).from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.pitchSlot, pitchSlot), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).limit(1);
      if (occupiedPitchSlot) return { error: "A selected pitch spot was just taken. Choose another open spot.", status: 409 } as const;
      existingRegistrations.push(existing);
    }

    const tickets: Array<{ id: string; userId: string; firstName: string; avatarUrl: string | null; pitchSlot: number; checkInToken: string; expiresAt: string }> = [];
    for (const [index, attendee] of attendees.entries()) {
      const existing = existingRegistrations[index];
      const pitchSlot = pitchSlots[index] as number;

      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const values = {
        bookedByUserId: userId,
        firstName: attendee.firstName,
        avatarUrl: attendee.avatarUrl,
        pitchSlot,
        positionPreference: friendOnly ? "anywhere" : index === 0 ? positionPreference : "anywhere",
        status: "joined",
        paymentStatus: "free",
        checkedInAt: null,
        checkinTokenHash: tokenHash,
        checkinExpiresAt,
        offerExpiresAt: null,
        updatedAt: new Date(),
      };
      const [registration] = existing
        ? await tx.update(registrationsTable).set(values).where(eq(registrationsTable.id, existing.id)).returning({ id: registrationsTable.id })
        : await tx.insert(registrationsTable).values({ matchId: match.id, userId: attendee.userId, ...values }).returning({ id: registrationsTable.id });
      tickets.push({ id: registration.id, userId: attendee.userId, firstName: attendee.firstName, avatarUrl: attendee.avatarUrl, pitchSlot, checkInToken: token, expiresAt: checkinExpiresAt.toISOString() });
    }

    await tx.update(matchesTable).set({ bookedCount: match.bookedCount + attendees.length, updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
    const invitedAttendees = friendOnly ? attendees : attendees.slice(1);
    if (invitedAttendees.length) {
      const inviterName = user.firstName || user.fullName?.split(" ")[0] || "A player";
      await tx.insert(notificationsTable).values(invitedAttendees.map((attendee) => ({
        userId: attendee.userId,
        matchId: match.id,
        kind: "match_invitation",
        message: `${inviterName} booked you a spot at ${match.venueName}. Your check-in QR is in My Matches.`,
      })));
    }
    return { status: 201, data: { status: "joined", matchId: match.id, venueName: match.venueName, tickets } } as const;
  });
  if ("error" in outcome) { res.status(outcome.status).json({ error: outcome.error }); return; }
  res.status(outcome.status).json(outcome.data);
});

router.post("/matches/:id/waitlist", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const user = await clerkClient.users.getUser(userId);
  const outcome = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    if (!match || match.status !== "published" || match.startsAt <= new Date()) return { error: "Match is no longer available.", status: 404 } as const;
    if (match.bookedCount < match.capacity) return { error: "There is still a place available. Join the match directly.", status: 409 } as const;
    const [existing] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, userId))).limit(1);
    if (existing && existing.status === "waitlisted") return { error: "You are already on the waitlist.", status: 409 } as const;
    if (existing && ["joined", "checked_in", "offered"].includes(existing.status)) return { error: "You already have a place or offer for this match.", status: 409 } as const;
    const positionPreference = ["anywhere", "goalkeeper", "defender", "midfielder", "attacker"].includes(req.body?.positionPreference) ? req.body.positionPreference : "anywhere";
    const values = { bookedByUserId: userId, firstName: user.firstName || user.fullName?.split(" ")[0] || "Player", avatarUrl: user.imageUrl || null, pitchSlot: null, positionPreference, status: "waitlisted", paymentStatus: "unpaid", checkinTokenHash: null, checkinExpiresAt: null, offerExpiresAt: null, updatedAt: new Date() };
    if (existing) await tx.update(registrationsTable).set(values).where(eq(registrationsTable.id, existing.id));
    else await tx.insert(registrationsTable).values({ matchId: match.id, userId, ...values });
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "waitlisted")));
    return { status: 201, position: count?.count ?? 1 } as const;
  });
  if ("error" in outcome) { res.status(outcome.status).json({ error: outcome.error }); return; }
  res.status(outcome.status).json({ status: "waitlisted", position: outcome.position });
});

router.delete("/matches/:id/registrations/me", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const registrationId = typeof req.query.registrationId === "string" ? req.query.registrationId : null;
  if (registrationId && !GetMatchParams.safeParse({ id: registrationId }).success) {
    res.status(400).json({ error: "Choose a valid registration." }); return;
  }
  const promoted = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    if (!match) return { error: "Match not found.", status: 404 } as const;
    const registrationAccess = registrationId
      ? and(eq(registrationsTable.id, registrationId), or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)))
      : eq(registrationsTable.userId, userId);
    const [registration] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), registrationAccess)).limit(1);
    if (!registration || registration.status === "cancelled") return { error: "You do not have an active place.", status: 404 } as const;
    if (registration.status === "checked_in") return { error: "A checked-in player cannot cancel their place.", status: 409 } as const;
    if (registration.paymentStatus === "paid") return { error: "Refund processing is not active yet. Your booking and payment are unchanged.", status: 503 } as const;
    const occupied = ["joined", "checked_in", "offered"].includes(registration.status);
    await tx.update(registrationsTable).set({ status: "cancelled", checkinTokenHash: null, offerExpiresAt: null, updatedAt: new Date() }).where(eq(registrationsTable.id, registration.id));
    if (!occupied) return { promotedUser: null } as const;
    const [next] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.status, "waitlisted"))).orderBy(asc(registrationsTable.createdAt)).for("update").limit(1);
    if (!next) {
      await tx.update(matchesTable).set({ bookedCount: Math.max(0, match.bookedCount - 1), updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
      return { promotedUser: null } as const;
    }
    const expiresAt = new Date(Date.now() + WAITLIST_OFFER_TTL_MS);
    await tx.update(registrationsTable).set({ status: "offered", offerExpiresAt: expiresAt, updatedAt: new Date() }).where(eq(registrationsTable.id, next.id));
    await tx.insert(notificationsTable).values({ userId: next.userId, matchId: match.id, kind: "waitlist_offer", message: `A place is available at ${match.venueName}. Accept within 10 minutes.` });
    return { promotedUser: next.userId } as const;
  });
  if ("error" in promoted) { res.status(promoted.status ?? 500).json({ error: promoted.error }); return; }
  if (promoted.promotedUser) await sendPushToUser(promoted.promotedUser, "A place just opened", "Your waitlist offer expires in 10 minutes.", { matchId: paramId(req.params.id), screen: "my-matches" });
  res.json({ cancelled: true, waitlistedPlayerNotified: Boolean(promoted.promotedUser) });
});

router.post("/matches/:id/waitlist/accept", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const outcome = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    const [entry] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, paramId(req.params.id)), eq(registrationsTable.userId, userId))).limit(1);
    if (!match || !entry || entry.status !== "offered") return { error: "There is no active place offer.", status: 404 } as const;
    if (match.status !== "published" || match.startsAt <= new Date()) return { error: "This match has already started; the offer can no longer be accepted.", status: 410 } as const;
    if (isOfferExpired(entry.offerExpiresAt)) {
      await tx.update(registrationsTable).set({ status: "cancelled", offerExpiresAt: null, updatedAt: new Date() }).where(eq(registrationsTable.id, entry.id));
      return { error: "This place offer has expired.", status: 410 } as const;
    }
    if (match.priceHalalas > 0) return { error: "Paid booking is unavailable until the payment provider is configured. Your offer remains active.", status: 503 } as const;
    const token = randomBytes(32).toString("base64url");
    await tx.update(registrationsTable).set({ status: "joined", paymentStatus: "free", offerExpiresAt: null, checkinTokenHash: createHash("sha256").update(token).digest("hex"), checkinExpiresAt: getMatchEndAt(match.startsAt, match.durationMinutes), updatedAt: new Date() }).where(eq(registrationsTable.id, entry.id));
    return { data: { status: "joined", checkInToken: token } } as const;
  });
  if ("error" in outcome) { res.status(outcome.status ?? 500).json({ error: outcome.error }); return; }
  res.json(outcome.data);
});

router.get("/me/registrations", requireAuth, async (_req, res): Promise<void> => {
  await expireWaitlistOffers();
  const userId = res.locals.userId as string;
  const rows = await db.select({
    registration: registrationsTable,
    match: {
      id: matchesTable.id,
      venueName: matchesTable.venueName,
      neighborhood: matchesTable.neighborhood,
      address: matchesTable.address,
      imageUrl: matchesTable.imageUrl,
      imageUrls: matchesTable.imageUrls,
      startsAt: matchesTable.startsAt,
      durationMinutes: matchesTable.durationMinutes,
      bookedCount: matchesTable.bookedCount,
      capacity: matchesTable.capacity,
      priceHalalas: matchesTable.priceHalalas,
      refereeUserId: matchesTable.refereeUserId,
      liveStatus: matchesTable.liveStatus,
    },
  }).from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
    .where(and(or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)), sql`${registrationsTable.status} IN ('joined', 'offered', 'waitlisted', 'checked_in')`))
    .orderBy(asc(matchesTable.startsAt));
  const myRatings = await db.select({ matchId: matchRatingsTable.matchId, pitchRating: matchRatingsTable.pitchRating, refereeRating: matchRatingsTable.refereeRating }).from(matchRatingsTable).where(eq(matchRatingsTable.userId, userId));
  const myRatingByMatch = new Map(myRatings.map((rating) => [rating.matchId, { pitchRating: rating.pitchRating, refereeRating: rating.refereeRating }]));
  res.json(rows.map(({ registration, match }) => ({
    id: registration.id,
    userId: registration.userId,
    bookedByUserId: registration.bookedByUserId,
    firstName: registration.firstName,
    pitchSlot: registration.pitchSlot,
    paymentStatus: registration.paymentStatus,
    status: registration.status,
    offerExpiresAt: registration.offerExpiresAt,
    checkInAvailable: registration.status === "joined",
    myRating: myRatingByMatch.get(registration.matchId) ?? null,
    match,
  })));
});

router.get("/matches/:id/check-in-token", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const matchId = paramId(req.params.id);
  const registrationId = typeof req.query.registrationId === "string" ? req.query.registrationId : null;
  if (registrationId && !GetMatchParams.safeParse({ id: registrationId }).success) {
    res.status(400).json({ error: "Choose a valid registration." }); return;
  }
  const registrationAccess = registrationId
    ? and(eq(registrationsTable.id, registrationId), or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)))
    : eq(registrationsTable.userId, userId);
  const [entry] = await db.select({ id: registrationsTable.id, firstName: registrationsTable.firstName, startsAt: matchesTable.startsAt, durationMinutes: matchesTable.durationMinutes, matchStatus: matchesTable.status })
    .from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
    .where(and(eq(registrationsTable.matchId, matchId), registrationAccess, eq(registrationsTable.status, "joined"))).limit(1);
  if (!entry) { res.status(404).json({ error: "An active registration is required to get a check-in code." }); return; }
  const expiresAt = getMatchEndAt(entry.startsAt, entry.durationMinutes);
  if (entry.matchStatus !== "published" || expiresAt <= new Date()) { res.status(410).json({ error: "The check-in window closes when this match ends." }); return; }
  const token = randomBytes(32).toString("base64url");
  const [row] = await db.update(registrationsTable).set({ checkinTokenHash: createHash("sha256").update(token).digest("hex"), checkinExpiresAt: expiresAt, updatedAt: new Date() }).where(and(eq(registrationsTable.id, entry.id), eq(registrationsTable.status, "joined"))).returning({ id: registrationsTable.id });
  if (!row) { res.status(404).json({ error: "An active registration is required to get a check-in code." }); return; }
  res.json({ token, firstName: entry.firstName, expiresAt: expiresAt.toISOString() });
});

router.post("/admin/matches/:id/check-in", requireAuth, async (req, res): Promise<void> => {
  const matchId = paramId(req.params.id);
  if (!GetMatchParams.safeParse({ id: matchId }).success) { res.status(400).json({ error: "Choose a valid match." }); return; }
  const userId = res.locals.userId as string;
  const [assignedMatch] = await db.select({ venueName: matchesTable.venueName, refereeUserId: matchesTable.refereeUserId, refereeAssignmentStatus: matchesTable.refereeAssignmentStatus, liveStatus: matchesTable.liveStatus, teamsGeneratedAt: matchesTable.teamsGeneratedAt })
    .from(matchesTable).where(eq(matchesTable.id, matchId)).limit(1);
  const canCheckInAsReferee = assignedMatch && await canControlLiveMatch(userId, assignedMatch.refereeUserId, assignedMatch.refereeAssignmentStatus);
  const pitchOwnerAccess = await getPitchOwnerAccess(userId);
  const canCheckInAsPitchOwner = !!assignedMatch && !!pitchOwnerAccess
    && pitchOwnerAccess.venueName.trim().toLowerCase() === assignedMatch.venueName.trim().toLowerCase();
  if (!assignedMatch || (!canCheckInAsReferee && !canCheckInAsPitchOwner)) {
    res.status(403).json({ error: "An assigned referee, pitch owner, or admin is required to check players in." }); return;
  }
  if (assignedMatch.liveStatus !== "scheduled" || assignedMatch.teamsGeneratedAt) { res.status(409).json({ error: "Player admission is closed after teams are generated or the match starts." }); return; }
  const token = req.body?.token;
  if (req.body?.ageChecked !== true) { res.status(400).json({ error: "Confirm that you checked the player's age against this match's age group before check-in." }); return; }
  if (typeof token !== "string" || token.length < 32) { res.status(400).json({ error: "Scan a valid player check-in QR code." }); return; }
  const hash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const admission = await db.transaction(async (tx) => {
    const [entry] = await tx.select({ id: registrationsTable.id, firstName: registrationsTable.firstName, startsAt: matchesTable.startsAt, durationMinutes: matchesTable.durationMinutes, matchStatus: matchesTable.status, liveStatus: matchesTable.liveStatus, teamsGeneratedAt: matchesTable.teamsGeneratedAt })
      .from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
      .where(and(eq(registrationsTable.matchId, matchId), eq(registrationsTable.checkinTokenHash, hash), eq(registrationsTable.status, "joined"))).for("update").limit(1);
    if (entry && (entry.liveStatus !== "scheduled" || entry.teamsGeneratedAt)) return { closed: true as const };
    if (!entry || entry.matchStatus !== "published" || !isCheckInTokenValid(getMatchEndAt(entry.startsAt, entry.durationMinutes), now)) return null;
    const [checkedIn] = await tx.update(registrationsTable).set({ status: "checked_in", checkedInAt: now, checkinTokenHash: null, checkinExpiresAt: null, updatedAt: now })
      .where(and(eq(registrationsTable.id, entry.id), eq(registrationsTable.status, "joined"), eq(registrationsTable.checkinTokenHash, hash)))
      .returning({ id: registrationsTable.id, firstName: registrationsTable.firstName });
    return checkedIn ? { closed: false as const, playerName: checkedIn.firstName } : null;
  });
  if (!admission) { res.status(409).json({ error: "This code is invalid, expired, or already used." }); return; }
  if (admission.closed) { res.status(409).json({ error: "Player admission closed when the team draw was generated or the match started." }); return; }
  res.json({ checkedIn: true, playerName: admission.playerName });
});

router.get("/me/notifications", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({ notification: notificationsTable, match: matchesTable })
    .from(notificationsTable)
    .leftJoin(matchesTable, eq(notificationsTable.matchId, matchesTable.id))
    .where(eq(notificationsTable.userId, res.locals.userId as string))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows.map(({ notification, match }) => ({
    ...notification,
    match: match ? {
      id: match.id,
      venueName: match.venueName,
      neighborhood: match.neighborhood,
      startsAt: match.startsAt,
      priceHalalas: match.priceHalalas,
    } : null,
  })));
});

router.patch("/me/notifications/read-all", requireAuth, async (_req, res): Promise<void> => {
  await db.update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, res.locals.userId as string), isNull(notificationsTable.readAt)));
  res.json({ read: true });
});

router.patch("/me/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const [notification] = await db.update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, paramId(req.params.id)), eq(notificationsTable.userId, res.locals.userId as string)))
    .returning({ id: notificationsTable.id });
  if (!notification) { res.status(404).json({ error: "Notification not found." }); return; }
  res.json({ read: true });
});

router.patch("/me/avatar", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const user = await clerkClient.users.getUser(userId);
  const updated = await db.update(registrationsTable)
    .set({ avatarUrl: user.imageUrl || null, updatedAt: new Date() })
    .where(and(
      eq(registrationsTable.userId, userId),
      sql`${registrationsTable.status} IN ('joined', 'checked_in', 'waitlisted', 'offered')`,
    ))
    .returning({ id: registrationsTable.id });
  res.json({ updatedRegistrations: updated.length });
});

router.get("/matches/:id", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.id, params.data.id),
        or(eq(matchesTable.status, "published"), eq(matchesTable.liveStatus, "full_time")),
      ),
    )
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Match not found." });
    return;
  }

  res.json(GetMatchResponse.parse((await addPitchRatings([row]))[0]));
});

router.post("/matches/:id/ratings", requireAuth, async (req, res): Promise<void> => {
  const matchId = paramId(req.params.id);
  const userId = res.locals.userId as string;
  const pitchRating = req.body?.pitchRating;
  const refereeRating = req.body?.refereeRating;
  if (!Number.isInteger(pitchRating) || pitchRating < 1 || pitchRating > 5 || (refereeRating != null && (!Number.isInteger(refereeRating) || refereeRating < 1 || refereeRating > 5))) {
    res.status(400).json({ error: "Rate the pitch from 1 to 5 stars and, optionally, the referee." }); return;
  }
  const [match] = await db.select().from(matchesTable).where(and(eq(matchesTable.id, matchId), eq(matchesTable.status, "published"))).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  const matchEnd = new Date(match.startsAt.getTime() + match.durationMinutes * 60_000);
  if (Date.now() < matchEnd.getTime()) { res.status(400).json({ error: "You can rate this match after it ends." }); return; }
  const [registration] = await db.select({ id: registrationsTable.id }).from(registrationsTable)
    .where(and(eq(registrationsTable.matchId, matchId), eq(registrationsTable.userId, userId), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).limit(1);
  if (!registration) { res.status(403).json({ error: "Only players who joined this match can leave a rating." }); return; }
  await db.insert(matchRatingsTable).values({ matchId, userId, pitchRating, refereeRating: match.refereeUserId ? refereeRating ?? null : null })
    .onConflictDoUpdate({ target: [matchRatingsTable.matchId, matchRatingsTable.userId], set: { pitchRating, refereeRating: match.refereeUserId ? refereeRating ?? null : null, createdAt: new Date() } });
  res.status(201).json({ saved: true });
});

router.get("/admin/admins", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  const administrators = await db.select({ email: adminAccessTable.email, createdAt: adminAccessTable.createdAt })
    .from(adminAccessTable).orderBy(asc(adminAccessTable.email));
  res.json({ ownerEmail: OWNER_EMAIL, administrators });
});

router.post("/admin/admins", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." }); return;
  }
  if (email === OWNER_EMAIL) {
    res.status(400).json({ error: "The owner already has permanent admin access." }); return;
  }
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const account = users.data.find((user) => user.emailAddresses.some((address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === email));
  if (!account) {
    res.status(404).json({ error: "No account with that verified email was found. Ask them to sign up and verify it first." }); return;
  }
  const [grant] = await db.insert(adminAccessTable).values({ email, grantedByUserId: res.locals.userId as string })
    .onConflictDoNothing({ target: adminAccessTable.email }).returning({ email: adminAccessTable.email, createdAt: adminAccessTable.createdAt });
  const [saved] = grant ? [grant] : await db.select({ email: adminAccessTable.email, createdAt: adminAccessTable.createdAt })
    .from(adminAccessTable).where(eq(adminAccessTable.email, email)).limit(1);
  res.status(grant ? 201 : 200).json(saved);
});

router.delete("/admin/admins/:email", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const email = paramId(req.params.email).trim().toLowerCase();
  if (email === OWNER_EMAIL) { res.status(403).json({ error: "The owner account cannot be removed." }); return; }
  const [removed] = await db.delete(adminAccessTable).where(eq(adminAccessTable.email, email)).returning({ email: adminAccessTable.email });
  if (!removed) { res.status(404).json({ error: "Admin access was not found." }); return; }
  res.json({ removed: true, email: removed.email });
});

router.get("/admin/referee-access", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  res.json(await db.select({ email: refereeAccessTable.email, createdAt: refereeAccessTable.createdAt }).from(refereeAccessTable).orderBy(asc(refereeAccessTable.email)));
});

router.post("/admin/referee-access", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const account = users.data.find((user) => user.emailAddresses.some((address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === email));
  if (!account) { res.status(404).json({ error: "No account with that verified email was found. Ask them to sign up and verify it first." }); return; }
  const [grant] = await db.insert(refereeAccessTable).values({ email, grantedByUserId: res.locals.userId as string }).onConflictDoNothing({ target: refereeAccessTable.email }).returning({ email: refereeAccessTable.email, createdAt: refereeAccessTable.createdAt });
  const [saved] = grant ? [grant] : await db.select({ email: refereeAccessTable.email, createdAt: refereeAccessTable.createdAt }).from(refereeAccessTable).where(eq(refereeAccessTable.email, email)).limit(1);
  res.status(grant ? 201 : 200).json(saved);
});

router.delete("/admin/referee-access/:email", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const email = paramId(req.params.email).trim().toLowerCase();
  const [removed] = await db.delete(refereeAccessTable).where(eq(refereeAccessTable.email, email)).returning({ email: refereeAccessTable.email });
  if (!removed) { res.status(404).json({ error: "Referee access was not found." }); return; }
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const account = users.data.find((user) => user.emailAddresses.some((address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === email));
  if (account) await db.update(matchesTable).set({ refereeAssignmentStatus: "pending", updatedAt: new Date() }).where(eq(matchesTable.refereeUserId, account.id));
  res.json({ removed: true, email: removed.email });
});

router.get("/me/pitch-owner", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  if (await isAdminUser(userId)) {
    const user = await clerkClient.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress ?? OWNER_EMAIL;
    res.json({ venueName: "", neighborhood: "", address: "", email, canManageAnyPitch: true });
    return;
  }
  const access = await getPitchOwnerAccess(userId);
  if (access) { res.json({ venueName: access.venueName, neighborhood: access.neighborhood, address: access.address, email: access.email, canManageAnyPitch: false }); return; }
  res.status(403).json({ error: "Pitch owner access is required." });
});

router.get("/pitch-owner/submissions", requireAuth, requirePitchOwner, async (_req, res): Promise<void> => {
  const rows = await db.select().from(pitchMatchSubmissionsTable)
    .where(eq(pitchMatchSubmissionsTable.ownerUserId, res.locals.userId as string))
    .orderBy(desc(pitchMatchSubmissionsTable.createdAt)).limit(50);
  res.json(rows);
});

router.post("/pitch-owner/submissions", requireAuth, requirePitchOwner, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const access = await getPitchOwnerAccess(userId);
  const canManageAnyPitch = await isAdminUser(userId);
  if (!access && !canManageAnyPitch) { res.status(403).json({ error: "Pitch owner access is required." }); return; }
  const user = canManageAnyPitch ? await clerkClient.users.getUser(userId) : null;
  const email = access?.email ?? user?.primaryEmailAddress?.emailAddress ?? OWNER_EMAIL;
  const venueName = access?.venueName ?? (typeof req.body?.venueName === "string" ? req.body.venueName.trim() : "");
  const neighborhood = access?.neighborhood ?? (typeof req.body?.neighborhood === "string" ? req.body.neighborhood.trim() : "");
  const submittedAddress = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const address = submittedAddress;
  if (!venueName || venueName.length > 120 || !neighborhood || neighborhood.length > 120 || address.length > 300 || !isGoogleMapsUrl(address)) { res.status(400).json({ error: "Add a valid HTTPS Google Maps link for the pitch location." }); return; }
  const contactPhone = typeof req.body?.contactPhone === "string" ? req.body.contactPhone.trim() : "";
  const startsAt = new Date(req.body?.startsAt);
  const capacity = Number(req.body?.capacity);
  const ageGroup = req.body?.ageGroup;
  const rentalPriceHalalas = Number(req.body?.rentalPriceHalalas);
  const imageUrls = req.body?.imageUrls ?? [];
  if (!/^\+?[0-9][0-9 ()-]{7,18}$/.test(contactPhone)) { res.status(400).json({ error: "Add a valid contact phone number so we can reach you about the pitch." }); return; }
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) { res.status(400).json({ error: "Choose a future match date and time." }); return; }
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 30) { res.status(400).json({ error: "Use a capacity from 2 to 30 players." }); return; }
  if (!Number.isSafeInteger(rentalPriceHalalas) || rentalPriceHalalas <= 0 || rentalPriceHalalas > 2_147_483_647) { res.status(400).json({ error: "Enter a valid pitch rental price in SAR." }); return; }
  if (!isMatchAgeGroup(ageGroup)) { res.status(400).json({ error: "Choose an age group for this match." }); return; }
  if (!isStoredMatchImageList(imageUrls)) { res.status(400).json({ error: "Upload up to 3 pitch photos before submitting the match request." }); return; }
  const [submission] = await db.insert(pitchMatchSubmissionsTable).values({
      ownerUserId: userId, ownerEmail: email, venueName, neighborhood,
      address, contactPhone, startsAt, durationMinutes: 120, capacity, ageGroup,
      priceHalalas: 0, compareAtPriceHalalas: 0, rentalPriceHalalas,
      refereeIncluded: true, waterIncluded: req.body?.waterIncluded !== false,
      imageUrls, status: "pending",
  }).returning();
  res.status(201).json(submission);
});

router.get("/admin/pitch-owners", requireAuth, requireOwner, async (_req, res): Promise<void> => {
  res.json(await db.select().from(pitchOwnerAccessTable).orderBy(asc(pitchOwnerAccessTable.email)));
});

router.post("/admin/pitch-owners", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const venueName = typeof req.body?.venueName === "string" ? req.body.venueName.trim() : "";
  const neighborhood = typeof req.body?.neighborhood === "string" ? req.body.neighborhood.trim() : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !venueName || venueName.length > 120 || !neighborhood || neighborhood.length > 120 || address.length < 5 || address.length > 500) {
    res.status(400).json({ error: "Add a valid verified email, pitch name, area, and full address." }); return;
  }
  const users = await clerkClient.users.getUserList({ emailAddress: [email], limit: 10 });
  const account = users.data.find((user) => user.emailAddresses.some((item) => item.verification?.status === "verified" && item.emailAddress.trim().toLowerCase() === email));
  if (!account) { res.status(404).json({ error: "No account with that verified email was found. Ask them to sign up and verify it first." }); return; }
  const [access] = await db.insert(pitchOwnerAccessTable).values({ email, venueName, neighborhood, address, grantedByUserId: res.locals.userId as string })
    .onConflictDoUpdate({ target: pitchOwnerAccessTable.email, set: { venueName, neighborhood, address, grantedByUserId: res.locals.userId as string } }).returning();
  res.status(200).json(access);
});

router.delete("/admin/pitch-owners/:email", requireAuth, requireOwner, async (req, res): Promise<void> => {
  const email = paramId(req.params.email).trim().toLowerCase();
  const [removed] = await db.delete(pitchOwnerAccessTable).where(eq(pitchOwnerAccessTable.email, email)).returning({ email: pitchOwnerAccessTable.email });
  if (!removed) { res.status(404).json({ error: "Pitch owner access was not found." }); return; }
  res.json({ removed: true, email: removed.email });
});

router.get("/admin/pitch-match-submissions", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(pitchMatchSubmissionsTable)
    .where(eq(pitchMatchSubmissionsTable.status, "pending"))
    .orderBy(asc(pitchMatchSubmissionsTable.startsAt)).limit(100);
  res.json(rows);
});

router.patch("/admin/pitch-match-submissions/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = paramId(req.params.id);
  const action = req.body?.action;
  const playerPriceHalalas = req.body?.playerPriceHalalas;
  const reviewNote = typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim().slice(0, 300) : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (action !== "approve" && action !== "reject")) { res.status(400).json({ error: "Choose a valid match request and review action." }); return; }
  if (action === "approve" && (!Number.isSafeInteger(playerPriceHalalas) || playerPriceHalalas < 0 || playerPriceHalalas > 2_147_483_647)) { res.status(400).json({ error: "Enter a valid player ticket price before approving this request." }); return; }
  const userId = res.locals.userId as string;
  const recipients = action === "approve" ? await getMatchAlertRecipientIds() : [];
  const result = await db.transaction(async (tx) => {
    const [submission] = await tx.select().from(pitchMatchSubmissionsTable).where(eq(pitchMatchSubmissionsTable.id, id)).for("update").limit(1);
    if (!submission || submission.status !== "pending") return { error: "This request is no longer pending." } as const;
    if (action === "approve" && !isGoogleMapsUrl(submission.address)) return { error: "This request needs a valid Google Maps link. Ask the pitch owner to submit the location link again." } as const;
    if (action === "approve" && !isStoredMatchImageList(submission.imageUrls)) return { error: "Move this request's photos to file storage before approving it." } as const;
    const reviewedAt = new Date();
    if (action === "reject") {
      const [updated] = await tx.update(pitchMatchSubmissionsTable).set({ status: "rejected", reviewNote, reviewedByUserId: userId, reviewedAt, updatedAt: reviewedAt }).where(eq(pitchMatchSubmissionsTable.id, id)).returning();
      return { submission: updated, match: null } as const;
    }
    const [match] = await tx.insert(matchesTable).values({
      venueName: submission.venueName, neighborhood: submission.neighborhood, address: submission.address,
      startsAt: submission.startsAt, durationMinutes: submission.durationMinutes, capacity: submission.capacity, ageGroup: submission.ageGroup,
      priceHalalas: playerPriceHalalas, compareAtPriceHalalas: playerPriceHalalas,
      status: "published", refereeIncluded: true, waterIncluded: submission.waterIncluded,
      imageUrls: submission.imageUrls, imageUrl: "match-card",
    }).returning();
    const [updated] = await tx.update(pitchMatchSubmissionsTable).set({ status: "approved", reviewNote: null, reviewedByUserId: userId, reviewedAt, matchId: match.id, updatedAt: reviewedAt }).where(eq(pitchMatchSubmissionsTable.id, id)).returning();
    const message = getNewMatchMessage(match);
    for (let offset = 0; offset < recipients.length; offset += 100) {
      await tx.insert(notificationsTable).values(recipients.slice(offset, offset + 100).map((recipientId) => ({ userId: recipientId, matchId: match.id, kind: "new_match", message })));
    }
    return { submission: updated, match } as const;
  });
  if ("error" in result && typeof result.error === "string") { res.status(400).json({ error: result.error }); return; }
  if (result.match && recipients.length) void sendPushToUsers(recipients, "A new match is available", getNewMatchMessage(result.match), { matchId: result.match.id, screen: "matches" }).catch(() => undefined);
  res.json({ submission: result.submission, match: result.match ? await addPitchRatings([result.match]).then((items) => items[0]) : null });
});

router.get("/admin/referees", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = [];
  let offset = 0;
  while (true) {
    const page = await clerkClient.users.getUserList({ limit: 100, offset });
    users.push(...page.data);
    if (page.data.length < 100) break;
    offset += page.data.length;
  }
  const adminGrants = await db.select({ email: adminAccessTable.email }).from(adminAccessTable);
  const refereeGrants = await db.select({ email: refereeAccessTable.email }).from(refereeAccessTable);
  const approvedEmails = new Set([
    ...`${process.env.MATCH_STAFF_EMAILS ?? ""}`.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
    OWNER_EMAIL,
    ...adminGrants.map((grant) => grant.email),
    ...refereeGrants.map((grant) => grant.email),
  ]);
  const referees = users.filter((user) => user.emailAddresses.some((email) => email.verification?.status === "verified" && approvedEmails.has(email.emailAddress.trim().toLowerCase())))
    .map((user) => ({ id: user.id, name: user.fullName ?? user.firstName ?? "Match referee", avatarUrl: user.imageUrl || null }));
  res.json(referees);
});

router.get(
  "/admin/matches",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(matchesTable)
      .orderBy(asc(matchesTable.startsAt));
    res.json(ListAdminMatchesResponse.parse(await addPitchRatings(rows)));
  },
);

router.post(
  "/admin/matches",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateAdminMatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (!isStoredMatchImageList(parsed.data.imageUrls)) { res.status(400).json({ error: "Upload up to 3 pitch photos before saving the match." }); return; }
    const imageUrls = parsed.data.imageUrls ?? [];

    if (
      parsed.data.compareAtPriceHalalas < parsed.data.priceHalalas ||
      parsed.data.startsAt <= new Date()
    ) {
      res.status(400).json({
        error:
          "Choose a future match time and a comparison price at least as high as the match price.",
      });
      return;
    }

    const recipients = parsed.data.status === "published" ? await getMatchAlertRecipientIds() : [];
    let refereeAssignment;
    try { refereeAssignment = await getRefereeAssignment(parsed.data.refereeUserId); }
    catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid referee." }); return; }
    const [row] = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(matchesTable)
        .values({ ...parsed.data, ...refereeAssignment, refereeIncluded: true, imageUrls, imageUrl: parsed.data.imageUrls?.length ? "match-card" : parsed.data.imageUrl })
        .returning();
      const message = getNewMatchMessage(created);
      for (let offset = 0; offset < recipients.length; offset += 100) {
        await tx.insert(notificationsTable).values(recipients.slice(offset, offset + 100).map((recipientId) => ({
          userId: recipientId,
          matchId: created.id,
          kind: "new_match",
          message,
        })));
      }
      return [created] as const;
    });

    if (recipients.length) void sendPushToUsers(recipients, "A new match is available", getNewMatchMessage(row), { matchId: row.id, screen: "matches" }).catch(() => undefined);
    if (row.status === "published" && row.refereeUserId) void notifyRefereeOfAssignment(row.refereeUserId, row).catch(() => undefined);

    res
      .status(201)
      .json(CreateAdminMatchResponse.parse((await addPitchRatings([row]))[0]));
  },
);

router.patch(
  "/admin/matches/:id",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAdminMatchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateAdminMatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (!isStoredMatchImageList(parsed.data.imageUrls)) { res.status(400).json({ error: "Upload up to 3 pitch photos before saving the match." }); return; }
    const imageUrls = parsed.data.imageUrls ?? [];

    const [existing] = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.id, params.data.id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Match not found." });
      return;
    }

    const nextPrice = parsed.data.priceHalalas ?? existing.priceHalalas;
    const nextCompareAt =
      parsed.data.compareAtPriceHalalas ?? existing.compareAtPriceHalalas;
    const nextStartsAt = parsed.data.startsAt ?? existing.startsAt;
    if (
      nextCompareAt < nextPrice ||
      (parsed.data.startsAt !== undefined && nextStartsAt <= new Date())
    ) {
      res.status(400).json({
        error:
          "Choose a future match time and a comparison price at least as high as the match price.",
      });
      return;
    }

    const shouldAnnounce = existing.status !== "published" && parsed.data.status === "published";
    const recipients = shouldAnnounce ? await getMatchAlertRecipientIds() : [];
    let refereeAssignment = {};
    if (parsed.data.refereeUserId !== undefined) {
      try {
        refereeAssignment = await getRefereeAssignment(parsed.data.refereeUserId);
        if (parsed.data.refereeUserId && parsed.data.refereeUserId === existing.refereeUserId) {
          refereeAssignment = { ...refereeAssignment, refereeAssignmentStatus: existing.refereeAssignmentStatus === "accepted" || existing.refereeAssignmentStatus === "referee_confirmed" ? existing.refereeAssignmentStatus : "pending" };
        }
      }
      catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid referee." }); return; }
    }
    const [row] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(matchesTable)
        .set({
        ...parsed.data,
        ...refereeAssignment,
        refereeIncluded: true,
        ...(parsed.data.imageUrls !== undefined ? { imageUrls, imageUrl: "match-card" } : parsed.data.imageUrl ? { imageUrls: [] } : {}),
        updatedAt: new Date(),
        })
        .where(eq(matchesTable.id, params.data.id))
        .returning();
      if (shouldAnnounce) {
        const message = getNewMatchMessage(updated);
        for (let offset = 0; offset < recipients.length; offset += 100) {
          await tx.insert(notificationsTable).values(recipients.slice(offset, offset + 100).map((recipientId) => ({
            userId: recipientId,
            matchId: updated.id,
            kind: "new_match",
            message,
          })));
        }
      }
      return [updated] as const;
    });

    if (shouldAnnounce && recipients.length) void sendPushToUsers(recipients, "A new match is available", getNewMatchMessage(row), { matchId: row.id, screen: "matches" }).catch(() => undefined);
    const refereeWasAssigned = row.refereeUserId && row.status === "published" && (existing.status !== "published" || existing.refereeUserId !== row.refereeUserId);
    if (refereeWasAssigned) void notifyRefereeOfAssignment(row.refereeUserId!, row).catch(() => undefined);

    res.json(UpdateAdminMatchResponse.parse((await addPitchRatings([row]))[0]));
  },
);

router.delete(
  "/admin/matches/:id",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteAdminMatchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [row] = await db
      .delete(matchesTable)
      .where(eq(matchesTable.id, params.data.id))
      .returning({ id: matchesTable.id });

    if (!row) {
      res.status(404).json({ error: "Match not found." });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;

