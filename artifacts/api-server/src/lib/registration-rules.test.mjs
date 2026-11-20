import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarUrl, canConfirmPaidRegistration, canReserveSeat, filterMatchesByDate, isCheckInTokenValid, isOfferExpired } from './registration-rules.ts';

const now = new Date('2026-11-20T12:00:00.000Z');

test('capacity check refuses the last seat once capacity is reached', () => {
  assert.equal(canReserveSeat(13, 14), true);
  assert.equal(canReserveSeat(14, 14), false);
  assert.equal(canReserveSeat(-1, 14), false);
});

test('paid registrations stay blocked without a provider while free games can book', () => {
  assert.equal(canConfirmPaidRegistration(3000, false), false);
  assert.equal(canConfirmPaidRegistration(0, false), true);
  assert.equal(canConfirmPaidRegistration(3000, true), true);
});

test('waitlist offers expire at their deadline', () => {
  assert.equal(isOfferExpired(new Date(now.getTime() + 1), now), false);
  assert.equal(isOfferExpired(now, now), true);
  assert.equal(isOfferExpired(null, now), true);
});

test('check-in tokens reject missing and expired timestamps', () => {
  assert.equal(isCheckInTokenValid(new Date(now.getTime() + 1), now), true);
  assert.equal(isCheckInTokenValid(now, now), false);
  assert.equal(isCheckInTokenValid(null, now), false);
});

test('date filtering includes the lower boundary and excludes the upper boundary', () => {
  const rows = [{ startsAt: '2026-11-20T12:00:00.000Z' }, { startsAt: '2026-11-21T12:00:00.000Z' }, { startsAt: '2026-11-22T12:00:00.000Z' }];
  assert.deepEqual(filterMatchesByDate(rows, now, new Date('2026-11-22T12:00:00.000Z')), rows.slice(0, 2));
});

test('calendar invite carries the event time and venue', () => {
  const url = new URL(buildCalendarUrl({ title: 'Football · Al Malqa', startsAt: now, durationMinutes: 120, location: 'Pitch 9, Riyadh' }));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('text'), 'Football · Al Malqa');
  assert.equal(url.searchParams.get('location'), 'Pitch 9, Riyadh');
  assert.equal(url.searchParams.get('dates'), '20261120T120000Z/20261120T140000Z');
});

