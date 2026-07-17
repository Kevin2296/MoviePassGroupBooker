import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomStore } from '../src/rooms.js';

test('maakt een groep en laat een vriend veilig deelnemen', () => {
  const store = new RoomStore();
  const host = store.create({ name: 'Kevin', ticketType: 'moviepass' });
  const guest = store.join({ code: host.room.code, name: 'Vriend', ticketType: 'moviepass' });
  assert.equal(guest.room.participants.length, 2);
  assert.equal(guest.room.participants[1].name, 'Vriend');
  assert.equal('token' in guest.room.participants[0], false);
});

test('alleen de groepsleider kan de voorstelling delen en starten', () => {
  const store = new RoomStore();
  const host = store.create({ name: 'Kevin' });
  const guest = store.join({ code: host.room.code, name: 'Vriend' });
  const showing = { film: 'Sneak Preview', sessionId: '2161', bookingUrl: '/kopen/overzicht/1022/HO00000068/2161' };
  assert.throws(() => store.update({ code: host.room.code, token: guest.token, action: 'set_showing', showing }), /groepsleider/);
  const selected = store.update({ code: host.room.code, token: host.token, action: 'set_showing', showing });
  assert.equal(selected.room.state, 'ready');
  const started = store.update({ code: host.room.code, token: host.token, action: 'start' });
  assert.equal(started.room.state, 'booking');
});

test('iedere deelnemer kan alleen met zijn eigen token status doorgeven', () => {
  const store = new RoomStore();
  const host = store.create({ name: 'Kevin' });
  const update = store.update({ code: host.room.code, token: host.token, action: 'status', status: 'afgerond', seat: '8-09' });
  assert.equal(update.room.participants[0].status, 'afgerond');
  assert.equal(update.room.participants[0].seat, '8-09');
  assert.throws(() => store.read({ code: host.room.code, token: 'fout' }), /uitnodiging/);
});

test('weigert externe of gemanipuleerde boekingslinks', () => {
  const store = new RoomStore();
  const host = store.create({ name: 'Kevin' });
  assert.throws(() => store.update({
    code: host.room.code,
    token: host.token,
    action: 'set_showing',
    showing: { sessionId: '1', bookingUrl: 'https://nepsite.example/inloggen' }
  }), /toegestane Vue/);
});

test('verwijdert een deelnemer direct bij het verlaten van de groep', () => {
  const store = new RoomStore();
  const host = store.create({ name: 'Kevin' });
  const guest = store.join({ code: host.room.code, name: 'Vriend' });
  assert.deepEqual(store.update({ code: host.room.code, token: guest.token, action: 'leave' }), { left: true });
  assert.equal(store.read({ code: host.room.code, token: host.token }).room.participants.length, 1);
});
