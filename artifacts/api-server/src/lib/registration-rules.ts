export const CHECK_IN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
export const WAITLIST_OFFER_TTL_MS = 10 * 60 * 1000;

export function isOfferExpired(expiresAt: Date | null, now = new Date()): boolean {
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

export function canConfirmPaidRegistration(priceHalalas: number, paymentProviderConfigured: boolean): boolean {
  return priceHalalas === 0 || paymentProviderConfigured;
}

export function canReserveSeat(bookedCount: number, capacity: number): boolean {
  return Number.isInteger(bookedCount) && Number.isInteger(capacity) && capacity > 0 && bookedCount >= 0 && bookedCount < capacity;
}

export function isCheckInTokenValid(expiresAt: Date | null, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() > now.getTime());
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

