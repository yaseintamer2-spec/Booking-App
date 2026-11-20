import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
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
import { db, matchesTable, notificationsTable, pushTokensTable, registrationsTable } from "@workspace/db";
import { isAdminUser, isMatchStaffUser, requireAdmin, requireAuth, requireMatchStaff } from "../middlewares/auth";
import { CHECK_IN_TOKEN_TTL_MS, WAITLIST_OFFER_TTL_MS, canConfirmPaidRegistration, canReserveSeat, isOfferExpired } from "../lib/registration-rules";

const router: IRouter = Router();

function paramId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toMatch(row: typeof matchesTable.$inferSelect) {
  return {
    ...row,
    spotsRemaining: Math.max(0, row.capacity - row.bookedCount),
  };
}

async function sendPushToUser(userId: string, title: string, body: string, data: Record<string, string>): Promise<void> {
  const tokens = await db.select().from(pushTokensTable).where(eq(pushTokensTable.userId, userId));
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
  res.json(ListMatchesResponse.parse(rows.filter((row) =>
    (!from || row.startsAt >= from) && (!to || row.startsAt < to) &&
    (!neighborhood || row.neighborhood.toLowerCase() === neighborhood)
  ).map(toMatch)));
});

router.get("/matches/:id/participants", async (req, res): Promise<void> => {
  const [match] = await db.select({ id: matchesTable.id }).from(matchesTable).where(and(eq(matchesTable.id, paramId(req.params.id)), eq(matchesTable.status, "published"))).limit(1);
  if (!match) { res.status(404).json({ error: "Match not found." }); return; }
  const rows = await db.select({ userId: registrationsTable.userId, firstName: registrationsTable.firstName, avatarUrl: registrationsTable.avatarUrl, positionPreference: registrationsTable.positionPreference })
    .from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`)).orderBy(asc(registrationsTable.createdAt));
  res.json(rows);
});

router.post("/matches/:id/registrations", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const positionPreference = req.body?.positionPreference;
  if (!["anywhere", "goalkeeper", "defender", "midfielder", "attacker"].includes(positionPreference)) {
    res.status(400).json({ error: "Choose a valid position preference." }); return;
  }
  const user = await clerkClient.users.getUser(userId);
  const firstName = user.firstName || user.fullName?.split(" ")[0] || "Player";
  const avatarUrl = user.imageUrl || null;
  const outcome = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    if (!match || match.status !== "published" || match.startsAt <= new Date()) return { error: "Match is no longer available.", status: 404 } as const;
    const [existing] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, userId))).limit(1);
    if (existing && ["joined", "checked_in"].includes(existing.status)) return { error: "You already joined this match.", status: 409 } as const;
    if (!canConfirmPaidRegistration(match.priceHalalas, false)) return { error: "Paid booking is unavailable until the payment provider is configured. No seat has been held.", status: 503 } as const;
    const [goalkeepers] = await tx.select({ count: sql<number>`count(*)::int` }).from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`, eq(registrationsTable.positionPreference, "goalkeeper")));
    if (positionPreference === "goalkeeper" && (goalkeepers?.count ?? 0) >= 2) return { error: "The goalkeeper preference is full for this match.", status: 409 } as const;
    if (!canReserveSeat(match.bookedCount, match.capacity)) return { error: "This match is full. Join the waitlist instead.", status: 409 } as const;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    if (existing) await tx.update(registrationsTable).set({ firstName, avatarUrl, positionPreference, status: "joined", paymentStatus: "free", checkedInAt: null, checkinTokenHash: tokenHash, checkinExpiresAt: new Date(Date.now() + CHECK_IN_TOKEN_TTL_MS), updatedAt: new Date() }).where(eq(registrationsTable.id, existing.id));
    else await tx.insert(registrationsTable).values({ matchId: match.id, userId, firstName, avatarUrl, positionPreference, status: "joined", paymentStatus: "free", checkinTokenHash: tokenHash, checkinExpiresAt: new Date(Date.now() + CHECK_IN_TOKEN_TTL_MS) });
    await tx.update(matchesTable).set({ bookedCount: match.bookedCount + 1, updatedAt: new Date() }).where(eq(matchesTable.id, match.id));
    return { status: 201, data: { status: "joined", checkInToken: token, matchId: match.id } } as const;
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
    const values = { firstName: user.firstName || user.fullName?.split(" ")[0] || "Player", avatarUrl: user.imageUrl || null, positionPreference, status: "waitlisted", paymentStatus: "unpaid", checkinTokenHash: null, checkinExpiresAt: null, offerExpiresAt: null, updatedAt: new Date() };
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
  const promoted = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matchesTable).where(eq(matchesTable.id, paramId(req.params.id))).for("update").limit(1);
    if (!match) return { error: "Match not found.", status: 404 } as const;
    const [registration] = await tx.select().from(registrationsTable).where(and(eq(registrationsTable.matchId, match.id), eq(registrationsTable.userId, userId))).limit(1);
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
    if (isOfferExpired(entry.offerExpiresAt)) {
      await tx.update(registrationsTable).set({ status: "cancelled", offerExpiresAt: null, updatedAt: new Date() }).where(eq(registrationsTable.id, entry.id));
      return { error: "This place offer has expired.", status: 410 } as const;
    }
    if (match.priceHalalas > 0) return { error: "Paid booking is unavailable until the payment provider is configured. Your offer remains active.", status: 503 } as const;
    const token = randomBytes(32).toString("base64url");
    await tx.update(registrationsTable).set({ status: "joined", paymentStatus: "free", offerExpiresAt: null, checkinTokenHash: createHash("sha256").update(token).digest("hex"), checkinExpiresAt: new Date(Date.now() + CHECK_IN_TOKEN_TTL_MS), updatedAt: new Date() }).where(eq(registrationsTable.id, entry.id));
    return { data: { status: "joined", checkInToken: token } } as const;
  });
  if ("error" in outcome) { res.status(outcome.status ?? 500).json({ error: outcome.error }); return; }
  res.json(outcome.data);
});

router.get("/me/registrations", requireAuth, async (_req, res): Promise<void> => {
  await expireWaitlistOffers();
  const userId = res.locals.userId as string;
  const rows = await db.select({ registration: registrationsTable, match: matchesTable }).from(registrationsTable).innerJoin(matchesTable, eq(registrationsTable.matchId, matchesTable.id)).where(and(eq(registrationsTable.userId, userId), sql`${registrationsTable.status} IN ('joined', 'offered', 'waitlisted', 'checked_in')`)).orderBy(asc(matchesTable.startsAt));
  res.json(rows.map(({ registration, match }) => ({ id: registration.id, status: registration.status, offerExpiresAt: registration.offerExpiresAt, checkInAvailable: registration.status === "joined", match: toMatch(match) })));
});

router.get("/matches/:id/check-in-token", requireAuth, async (req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHECK_IN_TOKEN_TTL_MS);
  const [row] = await db.update(registrationsTable).set({ checkinTokenHash: createHash("sha256").update(token).digest("hex"), checkinExpiresAt: expiresAt, updatedAt: new Date() }).where(and(eq(registrationsTable.matchId, paramId(req.params.id)), eq(registrationsTable.userId, userId), eq(registrationsTable.status, "joined"))).returning({ id: registrationsTable.id });
  if (!row) { res.status(404).json({ error: "An active registration is required to get a check-in code." }); return; }
  res.json({ token, expiresAt: expiresAt.toISOString() });
});

router.post("/admin/matches/:id/check-in", requireMatchStaff, async (req, res): Promise<void> => {
  const token = req.body?.token;
  if (typeof token !== "string" || token.length < 32) { res.status(400).json({ error: "Scan a valid player check-in QR code." }); return; }
  const hash = createHash("sha256").update(token).digest("hex");
  const [row] = await db.update(registrationsTable).set({ status: "checked_in", checkedInAt: new Date(), checkinTokenHash: null, checkinExpiresAt: null, updatedAt: new Date() }).where(and(eq(registrationsTable.matchId, paramId(req.params.id)), eq(registrationsTable.checkinTokenHash, hash), gt(registrationsTable.checkinExpiresAt, new Date()), eq(registrationsTable.status, "joined"))).returning({ id: registrationsTable.id, firstName: registrationsTable.firstName });
  if (!row) { res.status(409).json({ error: "This code is invalid, expired, or already used." }); return; }
  res.json({ checkedIn: true, playerName: row.firstName });
});

router.get("/me/notifications", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.userId, res.locals.userId as string)).orderBy(desc(notificationsTable.createdAt)).limit(50);
  res.json(rows);
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

  res.json(GetMatchResponse.parse(toMatch(row)));
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
    res.json(ListAdminMatchesResponse.parse(rows.map(toMatch)));
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

    const [row] = await db
      .insert(matchesTable)
      .values(parsed.data)
      .returning();

    res
      .status(201)
      .json(CreateAdminMatchResponse.parse(toMatch(row)));
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

    const [row] = await db
      .update(matchesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(matchesTable.id, params.data.id))
      .returning();

    res.json(UpdateAdminMatchResponse.parse(toMatch(row)));
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

