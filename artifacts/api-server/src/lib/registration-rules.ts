export const WAITLIST_OFFER_TTL_MS = 10 * 60 * 1000;

export function getMatchEndAt(startsAt: Date | string, durationMinutes: number): Date {
  return new Date(new Date(startsAt).getTime() + durationMinutes * 60_000);
}

export function isValidMatchImageList(value: unknown): value is string[] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 3 || !value.every((item) => typeof item === "string" && validMatchImage(item))) return false;
  return value.reduce<number>((total, image) => total + image.length, 0) <= 4_200_000;
}

function validMatchImage(value: string): boolean {
  if (value.length > 1_450_000) return false;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function isOfferExpired(expiresAt: Date | null, now = new Date()): boolean {
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

export function canConfirmPaidRegistration(priceHalalas: number, paymentProviderConfigured: boolean): boolean {
  return priceHalalas === 0 || paymentProviderConfigured;
}

export function canReserveSeat(bookedCount: number, capacity: number): boolean {
  return Number.isInteger(bookedCount) && Number.isInteger(capacity) && capacity > 0 && bookedCount >= 0 && bookedCount < capacity;
}

export function isCheckInTokenValid(matchEndsAt: Date | null, now = new Date()): boolean {
  return Boolean(matchEndsAt && matchEndsAt.getTime() > now.getTime());
}

export function buildCalendarUrl(input: { title: string; startsAt: Date; durationMinutes: number; location: string }): string {
  const end = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
  const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${stamp(input.startsAt)}/${stamp(end)}`,
    location: input.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function filterMatchesByDate<T extends { startsAt: Date | string }>(matches: T[], from?: Date, to?: Date): T[] {
  return matches.filter(({ startsAt }) => {
    const time = new Date(startsAt).getTime();
    return (!from || time >= from.getTime()) && (!to || time < to.getTime());
  });
}
