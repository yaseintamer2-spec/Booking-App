import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, legalAcceptancesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

export const TERMS_VERSION = "2026-11-21-v2";
export const PRIVACY_VERSION = "2026-11-21-v2";

const router: IRouter = Router();

router.get("/legal/acceptance", requireAuth, async (_req, res): Promise<void> => {
  const userId = res.locals.userId as string;
  const [record] = await db.select().from(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, userId)).limit(1);
  res.json({
    accepted: record?.termsVersion === TERMS_VERSION && record?.privacyVersion === PRIVACY_VERSION,
    termsVersion: record?.termsVersion ?? null,
    privacyVersion: record?.privacyVersion ?? null,
    acceptedAt: record?.acceptedAt?.toISOString() ?? null,
  });
});

router.post("/legal/acceptance", requireAuth, async (req, res): Promise<void> => {
  const { termsVersion, privacyVersion } = req.body ?? {};
  if (termsVersion !== TERMS_VERSION || privacyVersion !== PRIVACY_VERSION) {
    res.status(400).json({ error: "Please review the current Terms and Privacy Notice before continuing." });
    return;
  }
  const userId = res.locals.userId as string;
  const [record] = await db.insert(legalAcceptancesTable).values({ userId, termsVersion, privacyVersion })
    .onConflictDoUpdate({ target: legalAcceptancesTable.userId, set: { termsVersion, privacyVersion, acceptedAt: new Date() } })
    .returning({ acceptedAt: legalAcceptancesTable.acceptedAt });
  res.json({ accepted: true, termsVersion, privacyVersion, acceptedAt: record.acceptedAt.toISOString() });
});

export default router;
