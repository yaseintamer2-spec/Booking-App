import { clerkClient, getAuth } from "@clerk/express";
import { inArray } from "drizzle-orm";
import { adminAccessTable, db, pitchOwnerAccessTable, refereeAccessTable } from "@workspace/db";
import type { RequestHandler } from "express";

export const OWNER_EMAIL = "yaseintamer2@gmail.com";

export const requireAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  res.locals.userId = userId;
  next();
};

export async function isOwnerUser(userId: string): Promise<boolean> {
  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    (address) => address.verification?.status === "verified" && address.emailAddress.trim().toLowerCase() === OWNER_EMAIL,
  );
}

export async function isAdminUser(userId: string): Promise<boolean> {
  if (await isOwnerUser(userId)) return true;
  const user = await clerkClient.users.getUser(userId);
  const verifiedEmails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase());
  if (!verifiedEmails.length) return false;
  const [grant] = await db.select({ email: adminAccessTable.email }).from(adminAccessTable).where(inArray(adminAccessTable.email, verifiedEmails)).limit(1);
  return !!grant;
}

export async function isMatchStaffUser(userId: string): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  const allowlist = new Set(
    (process.env.MATCH_STAFF_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const user = await clerkClient.users.getUser(userId);
  const verifiedEmails = user.emailAddresses.filter((address) => address.verification?.status === "verified").map((address) => address.emailAddress.trim().toLowerCase());
  if (verifiedEmails.some((email) => allowlist.has(email))) return true;
  if (!verifiedEmails.length) return false;
  const [grant] = await db.select({ email: refereeAccessTable.email }).from(refereeAccessTable).where(inArray(refereeAccessTable.email, verifiedEmails)).limit(1);
  return !!grant;
}

export async function isPitchOwnerUser(userId: string): Promise<boolean> {
  const user = await clerkClient.users.getUser(userId);
  const verifiedEmails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.trim().toLowerCase());
  if (!verifiedEmails.length) return false;
  const [access] = await db.select({ email: pitchOwnerAccessTable.email }).from(pitchOwnerAccessTable)
    .where(inArray(pitchOwnerAccessTable.email, verifiedEmails)).limit(1);
  return !!access;
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

export const requireOwner: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (!(await isOwnerUser(userId))) {
    res.status(403).json({ error: "Only the application owner can manage admin access." });
    return;
  }
  res.locals.userId = userId;
  next();
};

export const requirePitchOwner: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) { res.status(401).json({ error: "Sign in to continue." }); return; }
  if (!(await isPitchOwnerUser(userId))) { res.status(403).json({ error: "Pitch owner access is required." }); return; }
  res.locals.userId = userId;
  next();
};

