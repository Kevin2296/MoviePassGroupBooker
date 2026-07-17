import { randomBytes, randomInt } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function token() {
  return randomBytes(24).toString('base64url');
}

function cleanName(value) {
  const name = String(value || '').trim().slice(0, 40);
  if (!name) throw new Error('Vul je naam in.');
  return name;
}

function cleanTicketType(value) {
  return value === 'regular' ? 'regular' : 'moviepass';
}

function cleanShowing(showing) {
  if (!showing?.sessionId || !showing?.bookingUrl) throw new Error('Kies eerst een geldige Vue-voorstelling.');
  const bookingUrl = String(showing.bookingUrl || '').trim();
  if (!bookingUrl.startsWith('/kopen/overzicht/') || bookingUrl.includes('://') || bookingUrl.includes('\\')) {
    throw new Error('Deze boekingslink hoort niet bij een toegestane Vue-voorstelling.');
  }
  const date = String(showing.date || '');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ongeldige voorstellingsdatum.');
  return {
    cinema: String(showing.cinema || '').slice(0, 80),
    cinemaId: String(showing.cinemaId || '').slice(0, 30),
    date: date.slice(0, 10),
    film: String(showing.film || '').slice(0, 160),
    filmId: String(showing.filmId || '').slice(0, 40),
    time: String(showing.time || '').slice(0, 8),
    sessionId: String(showing.sessionId || '').slice(0, 40),
    bookingUrl: bookingUrl.slice(0, 500),
    screenName: String(showing.screenName || '').slice(0, 80),
    formattedPrice: String(showing.formattedPrice || '').slice(0, 40)
  };
}

function publicRoom(room, participantId) {
  return {
    code: room.code,
    revision: room.revision,
    state: room.state,
    showing: room.showing,
    expiresAt: room.expiresAt,
    me: participantId,
    participants: [...room.participants.values()].map(({ token: ignored, ...participant }) => participant)
  };
}

export class RoomStore {
  constructor({ ttlMs = 12 * 60 * 60 * 1000, maxRooms = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxRooms = maxRooms;
    this.rooms = new Map();
  }

  cleanup(now = Date.now()) {
    for (const [code, room] of this.rooms) {
      if (room.expiresAt <= now) this.rooms.delete(code);
    }
  }

  makeCode() {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let index = 0; index < 6; index++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Er kon geen groepscode worden gemaakt.');
  }

  create({ name, ticketType }) {
    this.cleanup();
    if (this.rooms.size >= this.maxRooms) throw new Error('Er zijn tijdelijk te veel actieve groepen.');
    const now = Date.now();
    const code = this.makeCode();
    const participantId = token().slice(0, 12);
    const participantToken = token();
    const participant = {
      id: participantId,
      token: participantToken,
      name: cleanName(name),
      ticketType: cleanTicketType(ticketType),
      role: 'host',
      status: 'verbonden',
      seat: '',
      updatedAt: now
    };
    const room = {
      code,
      revision: 1,
      state: 'planning',
      showing: null,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      participants: new Map([[participantId, participant]])
    };
    this.rooms.set(code, room);
    return { token: participantToken, room: publicRoom(room, participantId) };
  }

  join({ code, name, ticketType }) {
    const room = this.get(code);
    if (room.participants.size >= 12) throw new Error('Deze groep zit vol.');
    const now = Date.now();
    const participantId = token().slice(0, 12);
    const participantToken = token();
    room.participants.set(participantId, {
      id: participantId,
      token: participantToken,
      name: cleanName(name),
      ticketType: cleanTicketType(ticketType),
      role: 'guest',
      status: 'verbonden',
      seat: '',
      updatedAt: now
    });
    this.touch(room);
    return { token: participantToken, room: publicRoom(room, participantId) };
  }

  read({ code, token: participantToken }) {
    const room = this.get(code);
    const participant = this.authorize(room, participantToken);
    participant.updatedAt = Date.now();
    return { room: publicRoom(room, participant.id) };
  }

  update({ code, token: participantToken, action, showing, status, seat }) {
    const room = this.get(code);
    const participant = this.authorize(room, participantToken);
    if (action === 'set_showing') {
      if (participant.role !== 'host') throw new Error('Alleen de groepsleider kan de voorstelling wijzigen.');
      room.showing = cleanShowing(showing);
      room.state = 'ready';
    } else if (action === 'start') {
      if (participant.role !== 'host') throw new Error('Alleen de groepsleider kan de boeking starten.');
      if (!room.showing) throw new Error('De groepsleider heeft nog geen voorstelling gekozen.');
      room.state = 'booking';
    } else if (action === 'status') {
      const allowed = new Set(['verbonden', 'klaar', 'boeken', 'afgerond', 'probleem']);
      participant.status = allowed.has(status) ? status : 'verbonden';
      participant.seat = String(seat || '').trim().slice(0, 20);
      participant.updatedAt = Date.now();
    } else if (action === 'leave') {
      if (participant.role === 'host') this.rooms.delete(room.code);
      else {
        room.participants.delete(participant.id);
        this.touch(room);
      }
      return { left: true };
    } else {
      throw new Error('Onbekende groepsactie.');
    }
    this.touch(room);
    return { room: publicRoom(room, participant.id) };
  }

  get(value) {
    this.cleanup();
    const code = String(value || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error('Groep niet gevonden of verlopen.');
    return room;
  }

  authorize(room, participantToken) {
    for (const participant of room.participants.values()) {
      if (participant.token === participantToken) return participant;
    }
    throw new Error('Deze uitnodiging is niet meer geldig.');
  }

  touch(room) {
    room.revision++;
    room.expiresAt = Date.now() + this.ttlMs;
  }
}
