import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarUrl, canConfirmPaidRegistration, canReserveSeat, filterMatchesByDate, getMatchEndAt, isCheckInTokenValid, isOfferExpired, isValidMatchImageList } from './registration-rules.ts';

const now = new Date('2026-11-20T12:00:00.000Z');

test('capacity check refuses the last seat once capacity is reached', () => {
  assert.equal(canReserveSeat(13, 14), true);
  assert.equal(canReserveSeat(14, 14), false);
  assert.equal(canReserveSeat(-1, 14), false);
});

test('registration continues during payment test mode without collecting money', () => {
  assert.equal(canConfirmPaidRegistration(3000, false), true);
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

test('check-in tokens use the match end time instead of a fixed request TTL', () => {
  const startsAt = new Date('2026-11-21T18:00:00.000Z');
  const matchEndsAt = getMatchEndAt(startsAt, 120);
  assert.equal(matchEndsAt.toISOString(), '2026-11-21T20:00:00.000Z');
  assert.equal(isCheckInTokenValid(matchEndsAt, new Date('2026-11-21T19:59:59.999Z')), true);
  assert.equal(isCheckInTokenValid(matchEndsAt, matchEndsAt), false);
  assert.equal(getMatchEndAt(startsAt, 90).toISOString(), '2026-11-21T19:30:00.000Z');
});

test('match galleries accept up to three safe photos', () => {
  assert.equal(isValidMatchImageList(undefined), true);
  assert.equal(isValidMatchImageList(['https://images.example/pitch.jpg', 'data:image/jpeg;base64,AAAA']), true);
  assert.equal(isValidMatchImageList(['https://one.example/a.jpg', 'https://two.example/b.jpg', 'https://three.example/c.jpg', 'https://four.example/d.jpg']), false);
  assert.equal(isValidMatchImageList(['http://images.example/pitch.jpg']), false);
  assert.equal(isValidMatchImageList([`data:image/jpeg;base64,${'A'.repeat(1_450_001)}`]), false);
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
