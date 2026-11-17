import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { and, asc, eq, gt, sql } from "drizzle-orm";
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
import { db, matchesTable } from "@workspace/db";
import { isAdminUser, requireAdmin, requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function toMatch(row: typeof matchesTable.$inferSelect) {
  return {
    ...row,
    spotsRemaining: Math.max(0, row.capacity - row.bookedCount),
  };
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

router.get("/matches", async (_req, res): Promise<void> => {
  const now = new Date();
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

  res.json(ListMatchesResponse.parse(rows.map(toMatch)));
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
