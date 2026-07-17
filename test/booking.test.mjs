import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingPlan, validateAccount } from '../src/booking.js';

const validInput = {
  cinema: 'Kerkrade', cinemaId: '1022', film: 'Sneak Preview', filmId: 'HO-SNEAK', date: '2026-07-18', time: '20:30', sessionId: '1234', bookingUrl: '/kopen/overzicht/1022/HO-SNEAK/1234', seatPreference: 'center',
  accounts: [{ id: 'kevin', name: 'Kevin' }, { id: 'vriend', name: 'Vriend' }]
};

test('maakt per account een losse order', () => {
  const plan = createBookingPlan(validInput);
  assert.equal(plan.orders.length, 2);
  assert.deepEqual(plan.orders.map(order => order.holder), ['Kevin', 'Vriend']);
  assert.equal(plan.orders[1].seat, 'naast vorige stoel');
});

test('staat een testboeking met één account toe', () => {
  const plan = createBookingPlan({ ...validInput, accounts: [validInput.accounts[0]] });
  assert.equal(plan.orders.length, 1);
  assert.equal(plan.orders[0].holder, 'Kevin');
});

test('bewaart de exacte Vue-sessie en boekings-URL', () => {
  const plan = createBookingPlan(validInput);
  assert.equal(plan.showing.time, '20:30');
  assert.equal(plan.showing.sessionId, '1234');
  assert.match(plan.showing.bookingUrl, /1234$/);
});

test('weigert lege en dubbele accounts', () => {
  assert.throws(() => validateAccount({ id: 'x', name: '' }, 0), /naam/);
  assert.throws(() => createBookingPlan({ ...validInput, accounts: [validInput.accounts[0], validInput.accounts[0]] }), /dubbel/);
});
