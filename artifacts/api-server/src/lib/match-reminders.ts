import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, matchesTable, notificationsTable, pushTokensTable, registrationsTable } from "@workspace/db";

const REMINDER_LEAD_MS = 60 * 60 * 1000;

/** Creates one in-app and optional push reminder per player, about one hour before kickoff. */
export async function sendDueMatchReminders(now = new Date()): Promise<void> {
  const matches = await db.select({ id: matchesTable.id, venueName: matchesTable.venueName, startsAt: matchesTable.startsAt })
    .from(matchesTable)
    .where(and(eq(matchesTable.status, "published"), gt(matchesTable.startsAt, now), lt(matchesTable.startsAt, new Date(now.getTime() + REMINDER_LEAD_MS))));

  for (const match of matches) {
    const players = await db.selectDistinct({ userId: registrationsTable.userId }).from(registrationsTable)
      .where(and(eq(registrationsTable.matchId, match.id), sql`${registrationsTable.status} IN ('joined', 'checked_in')`));
    if (!players.length) continue;
    const kickoffTime = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" }).format(match.startsAt);
    const message = `Kickoff is in about an hour at ${match.venueName} (${kickoffTime} Riyadh). Open your match for the pitch location and check-in QR.`;

    for (const { userId } of players) {
      const [created] = await db.insert(notificationsTable).values({ userId, matchId: match.id, kind: "match_reminder", message })
        .onConflictDoNothing({ target: [notificationsTable.userId, notificationsTable.matchId], where: sql`${notificationsTable.kind} = 'match_reminder' AND ${notificationsTable.matchId} IS NOT NULL` })
        .returning({ id: notificationsTable.id, pushSentAt: notificationsTable.pushSentAt });
      const notification = created ?? (await db.select({ id: notificationsTable.id, pushSentAt: notificationsTable.pushSentAt }).from(notificationsTable)
        .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.matchId, match.id), eq(notificationsTable.kind, "match_reminder"))).limit(1))[0];
      if (!notification || notification.pushSentAt) continue;

      const tokens = await db.select().from(pushTokensTable).where(eq(pushTokensTable.userId, userId));
      if (!tokens.length) continue;
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
          body: JSON.stringify(tokens.map(({ expoPushToken }) => ({
            to: expoPushToken,
            title: "Kickoff in about an hour",
            body: message,
            data: { type: "match_reminder", matchId: match.id },
            sound: "default",
            channelId: "match-updates",
          }))),
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) continue;
        const result = await response.json() as { data?: Array<{ status?: string; details?: { error?: string } }> };
        const successful = result.data?.some(ticket => ticket.status === "ok") ?? false;
        const staleTokens = tokens.filter((_, index) => result.data?.[index]?.details?.error === "DeviceNotRegistered");
        for (const stale of staleTokens) await db.delete(pushTokensTable).where(eq(pushTokensTable.expoPushToken, stale.expoPushToken));
        if (successful) await db.update(notificationsTable).set({ pushSentAt: new Date() }).where(eq(notificationsTable.id, notification.id));
      } catch {
        // Keep the in-app reminder and retry the push on the next scheduler pass.
      }
    }
  }
}


