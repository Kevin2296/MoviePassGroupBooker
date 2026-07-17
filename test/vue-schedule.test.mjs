import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchedule } from '../src/vue-schedule.js';

test('zet Vue-films en sessies om naar film- en tijdkeuzes', () => {
  const normalized = normalizeSchedule({ result: [{
    filmId: 'SNEAK', filmTitle: 'Sneak Preview', showingGroups: [{ sessions: [{
      sessionId: '42', startTime: '2026-07-15T20:30:00', bookingUrl: '/kopen/overzicht/1022/SNEAK/42',
      formattedPrice: '€ 13,00', screenName: 'Zaal 3', isSoldOut: false, isBookingAvailable: true
    }] }]
  }] }, { cinemaId: '1022', cinemaName: 'Kerkrade' }, '2026-07-15');
  assert.equal(normalized.films[0].title, 'Sneak Preview');
  assert.equal(normalized.films[0].sessions[0].time, '20:30');
  assert.equal(normalized.films[0].sessions[0].sessionId, '42');
});
