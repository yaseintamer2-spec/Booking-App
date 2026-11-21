import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
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
} from "@workspace/api-zod";
import { db, matchAlertSubscriptionsTable, matchRatingsTable, matchesTable, notificationsTable, pushTokensTable, registrationsTable } from "@workspace/db";
import { isAdminUser, isMatchStaffUser, requireAdmin, requireAuth, requireMatchStaff } from "../middlewares/auth";
import { getMatchEndAt, WAITLIST_OFFER_TTL_MS, canConfirmPaidRegistration, canReserveSeat, isCheckInTokenValid, isOfferExpired, isValidMatchImageList } from "../lib/registration-rules";

const router: IRouter = Router();

function paramId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
  if (!userId) return { refereeUserId: null, refereeName: null, refereeAvatarUrl: null };
  if (!(await isMatchStaffUser(userId))) throw new Error("Choose an account approved for match staff.");
  const user = await clerkClient.users.getUser(userId);
  return { refereeUserId: user.id, refereeName: user.fullName ?? user.firstName ?? "Match referee", refereeAvatarUrl: user.imageUrl || null };
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
    }),
  );
});

router.get("/me/match-staff", requireAuth, async (_req, res): Promise<void> => {
  res.json({ isStaff: await isMatchStaffUser(res.locals.userId as string) });
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
  const [match] = await db.select({ id: matchesTable.id }).from(matchesTable).where(and(eq(matchesTable.id, paramId(req.params.id)), eq(matchesTable.status, "published"))).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  const rows = await db.select({ userId: registrationsTable.userId, firstName: registrationsTable.firstName, avatarUrl: registrationsTable.avatarUrl, pitchSlot: registrationsTable.pitchSlot, positionPreference: registrationsTable.positionPreference })
    .from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).orderBy(asc(registrationsTable.createdAt));
  res.json(rows);
});

router.post("/matches/:id/registrations", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const positionPreference = req.body?.positionPreference;
  const friendEmails = req.body?.friendEmails;
  const pitchSlots = req.body?.pitchSlots;
  if (!["anywhere", "goalkeeper", "defender", "midfielder", "attacker"].includes(positionPreference)) {
    res.status(400).json({ error: "Choose a valid position preference." }); return;
  }
  if (!Array.isArray(friendEmails) || friendEmails.length > 13 || friendEmails.some((email: unknown) => typeof email !== "string")) {
    res.status(400).json({ error: "Add up to 13 friends by email." }); return;
  }
  const normalizedEmails = friendEmails.map((email: string) => email.trim().toLowerCase());
  if (
    normalizedEmails.some((email: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    new Set(normalizedEmails).size !== normalizedEmails.length
  ) { res.status(400).json({ error: "Use a different, valid email for each friend." }); return; }
  if (
    !Array.isArray(pitchSlots) ||
    pitchSlots.length !== normalizedEmails.length + 1 ||
    pitchSlots.some((slot: unknown) => !Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= 14) ||
    new Set(pitchSlots).size !== pitchSlots.length
  ) { res.status(400).json({ error: "Choose one different open pitch spot per attendee." }); return; }

  const user = await clerkClient.users.getUser(userId);
  const friendUsers = normalizedEmails.length
    ? (await clerkClient.users.getUserList({ emailAddress: normalizedEmails, limit: 100 })).data
    : [];
  const attendees = [{
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
        positionPreference: index === 0 ? positionPreference : "anywhere",
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
    if (attendees.length > 1) {
      await tx.insert(notificationsTable).values(attendees.slice(1).map((attendee) => ({
        userId: attendee.userId,
        matchId: match.id,
        kind: "match_invitation",
        message: `${attendees[0].firstName} booked you a free spot at ${match.venueName}. Your check-in QR is in My Matches.`,
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
    if (registration.paymentStatus === "paid") return { error: "A refund provider must be configured before a paid booking can be cancelled here.", status: 503 } as const;
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
  const rows = await db.select({ registration: registrationsTable, match: matchesTable }).from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id)).where(and(or(eq(registrationsTable.userId, userId), eq(registrationsTable.bookedByUserId, userId)), sql`${registrationsTable.status} IN ('joined', 'offered', 'waitlisted', 'checked_in')`)).orderBy(asc(matchesTable.startsAt));
  const ratedMatches = await addPitchRatings(rows.map(({ match }) => match));
  const myRatings = await db.select({ matchId: matchRatingsTable.matchId, pitchRating: matchRatingsTable.pitchRating, refereeRating: matchRatingsTable.refereeRating }).from(matchRatingsTable).where(eq(matchRatingsTable.userId, userId));
  const myRatingByMatch = new Map(myRatings.map((rating) => [rating.matchId, { pitchRating: rating.pitchRating, refereeRating: rating.refereeRating }]));
  res.json(rows.map(({ registration }, index) => ({
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
    match: ratedMatches[index],
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

router.post("/admin/matches/:id/check-in", requireMatchStaff, async (req, res): Promise<void> => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length < 32) { res.status(400).json({ error: "Scan a valid player check-in QR code." }); return; }
  const hash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const [entry] = await tx.select({ id: registrationsTable.id, firstName: registrationsTable.firstName, startsAt: matchesTable.startsAt, durationMinutes: matchesTable.durationMinutes, matchStatus: matchesTable.status })
      .from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id))
      .where(and(eq(registrationsTable.matchId, paramId(req.params.id)), eq(registrationsTable.checkinTokenHash, hash), eq(registrationsTable.status, "joined"))).for("update").limit(1);
    if (!entry || entry.matchStatus !== "published" || !isCheckInTokenValid(getMatchEndAt(entry.startsAt, entry.durationMinutes), now)) return null;
    const [checkedIn] = await tx.update(registrationsTable).set({ status: "checked_in", checkedInAt: now, checkinTokenHash: null, checkinExpiresAt: null, updatedAt: now })
      .where(and(eq(registrationsTable.id, entry.id), eq(registrationsTable.status, "joined"), eq(registrationsTable.checkinTokenHash, hash)))
      .returning({ id: registrationsTable.id, firstName: registrationsTable.firstName });
    return checkedIn ?? null;
  });
  if (!row) { res.status(409).json({ error: "This code is invalid, expired, or already used." }); return; }
  res.json({ checkedIn: true, playerName: row.firstName });
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
        eq(matchesTable.status, "published"),
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

router.get("/admin/referees", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = [];
  let offset = 0;
  while (true) {
    const page = await clerkClient.users.getUserList({ limit: 100, offset });
    users.push(...page.data);
    if (page.data.length < 100) break;
    offset += page.data.length;
  }
  const approvedEmails = new Set(`${process.env.MATCH_STAFF_EMAILS ?? ""},${process.env.ADMIN_EMAILS ?? ""}`.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
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

    if (!isValidMatchImageList(parsed.data.imageUrls)) { res.status(400).json({ error: "Add up to 3 HTTPS photos. Each photo must be under 1.45 MB." }); return; }
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
        .values({ ...parsed.data, ...refereeAssignment, imageUrls, imageUrl: parsed.data.imageUrls?.length ? "match-card" : parsed.data.imageUrl })
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

    if (!isValidMatchImageList(parsed.data.imageUrls)) { res.status(400).json({ error: "Add up to 3 HTTPS photos. Each photo must be under 1.45 MB." }); return; }
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
      try { refereeAssignment = await getRefereeAssignment(parsed.data.refereeUserId); }
      catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid referee." }); return; }
    }
    const [row] = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(matchesTable)
        .set({
        ...parsed.data,
        ...refereeAssignment,
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
