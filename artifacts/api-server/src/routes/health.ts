import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  const clerkConfigured = Boolean(
    process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );

  try {
    await pool.query("select 1");
  } catch {
    res.status(503).json({
      status: "error",
      checks: { database: "unavailable", clerk: clerkConfigured ? "configured" : "missing" },
    });
    return;
  }

  if (!clerkConfigured) {
    res.status(503).json({
      status: "error",
      checks: { database: "ok", clerk: "missing" },
    });
    return;
  }

  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, checks: { database: "ok", clerk: "configured" } });
});

export default router;
