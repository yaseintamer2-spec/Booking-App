import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  res.locals.userId = userId;
  next();
};

function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isAdminUser(userId: string): Promise<boolean> {
  const allowlist = getAdminEmails();
  if (allowlist.size === 0) return false;

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    (address) =>
      address.verification?.status === "verified" &&
      allowlist.has(address.emailAddress.trim().toLowerCase()),
  );
}

export async function isMatchStaffUser(userId: string): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  const allowlist = new Set(
    (process.env.MATCH_STAFF_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowlist.size === 0) return false;
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    (address) => address.verification?.status === "verified" && allowlist.has(address.emailAddress.trim().toLowerCase()),
  );
}

export const requireMatchStaff: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in to continue." }); return; }
  if (!(await isMatchStaffUser(userId))) { res.status(403).json({ error: "Match staff access is required." }); return; }
  res.locals.userId = userId;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  if (!(await isAdminUser(userId))) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }

  res.locals.userId = userId;
  next();
};

