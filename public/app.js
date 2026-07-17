const form = document.querySelector('#booking-form');
const accountsBox = document.querySelector('#accounts');
const accountTemplate = document.querySelector('#account-template');
const nameInput = document.querySelector('#new-account-name');
const errorBox = document.querySelector('#form-error');
const result = document.querySelector('#result');
const submitButton = form.querySelector('[type="submit"]');
const programBox = document.querySelector('#program');
const programStatus = document.querySelector('#program-status');
const dateSelect = document.querySelector('#date-select');
const cinemaSelect = form.elements.cinema;
const native = window.MoviePassNative;
const syncServerInput = document.querySelector('#sync-server');
const groupNameInput = document.querySelector('#group-name');
const groupTicketInput = document.querySelector('#group-ticket');
const joinCodeInput = document.querySelector('#join-code');
const groupSetup = document.querySelector('#group-setup');
const groupLive = document.querySelector('#group-live');
const groupError = document.querySelector('#group-error');
const roomBookButton = document.querySelector('#room-book');
const roomDoneButton = document.querySelector('#room-done');
const configuredSyncServer = normalizeServer(window.MoviePassConfig?.syncServer);
let accounts = [];
let currentPlan = null;
let currentSchedule = null;
let selectedShowing = null;
let groupSession = null;
let groupRoom = null;
let roomPollTimer = null;
let noticeTimer = null;
let participantStatuses = new Map();

function normalizeServer(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function loadGroupSession() {
  syncServerInput.value = configuredSyncServer || localStorage.getItem('moviepass-sync-server') || (location.protocol.startsWith('http') ? location.origin : '');
  if (configuredSyncServer) {
    document.querySelector('#sync-server-field').hidden = true;
    document.querySelector('#sync-mode').textContent = 'Verbonden met de beveiligde openbare groepsserver. Vue-login en betaalgegevens blijven op je eigen telefoon.';
  }
  groupNameInput.value = localStorage.getItem('moviepass-group-name') || '';
  try { groupSession = JSON.parse(localStorage.getItem('moviepass-room-session') || 'null'); } catch { groupSession = null; }
  if (groupSession?.server && groupSession?.code && groupSession?.token) {
    syncServerInput.value = groupSession.server;
    pollRoom(true);
  }
}

async function syncPost(path, payload) {
  const server = normalizeServer(groupSession?.server || syncServerInput.value);
  if (!/^https?:\/\//i.test(server)) throw new Error('Vul het volledige serveradres in, inclusief https://');
  localStorage.setItem('moviepass-sync-server', server);
  if (native?.syncPost) {
    const response = JSON.parse(native.syncPost(server, path, JSON.stringify(payload)));
    if (response.error) throw new Error(response.error);
    return response;
  }
  const response = await fetch(server + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Synchroniseren is mislukt.');
  return data;
}

function showGroupError(error) {
  groupError.textContent = error?.message || String(error);
  groupError.hidden = false;
}

async function createOrJoinRoom(mode) {
  groupError.hidden = true;
  const name = groupNameInput.value.trim();
  if (!name) return groupNameInput.focus();
  const server = normalizeServer(syncServerInput.value);
  groupSession = { server };
  const request = { name, ticketType: groupTicketInput.value };
  if (mode === 'join') request.code = joinCodeInput.value.trim().toUpperCase();
  try {
    const result = await syncPost(`/api/rooms/${mode}`, request);
    groupSession = { server, code: result.room.code, token: result.token };
    localStorage.setItem('moviepass-group-name', name);
    localStorage.setItem('moviepass-room-session', JSON.stringify(groupSession));
    applyRoom(result.room);
    startRoomPolling();
  } catch (error) {
    groupSession = null;
    showGroupError(error);
  }
}

function startRoomPolling() {
  clearInterval(roomPollTimer);
  roomPollTimer = setInterval(() => pollRoom(false), 2500);
}

async function pollRoom(firstLoad = false) {
  if (!groupSession) return;
  try {
    const result = await syncPost('/api/rooms/read', { code: groupSession.code, token: groupSession.token });
    applyRoom(result.room);
    startRoomPolling();
  } catch (error) {
    if (firstLoad || /uitnodiging|groep niet gevonden/i.test(error?.message || '')) {
      clearRoomLocal();
      showGroupError(error);
    } else showGroupError(error);
  }
}

function myParticipant() {
  return groupRoom?.participants?.find(person => person.id === groupRoom.me);
}

function applyRoom(room) {
  const nextStatuses = new Map(room.participants.map(person => [person.id, person.status]));
  room.participants.forEach(person => {
    const previous = participantStatuses.get(person.id);
    if (person.id !== room.me && previous && previous !== 'boeken' && person.status === 'boeken') {
      showActivityNotice(`${person.name} is begonnen met boeken.`);
    }
  });
  participantStatuses = nextStatuses;
  groupRoom = room;
  groupSetup.hidden = true;
  groupLive.hidden = false;
  groupError.hidden = true;
  document.querySelector('#room-code').textContent = room.code;
  const showing = room.showing;
  document.querySelector('#room-showing').textContent = showing
    ? `${showing.film} · ${showing.date} om ${showing.time} · Vue ${showing.cinema}`
    : 'De groepsleider kiest zo de voorstelling.';
  const me = myParticipant();
  form.hidden = me?.role !== 'host';
  result.hidden = me?.role !== 'host' || !currentPlan;
  document.querySelector('#room-people').innerHTML = room.participants.map(person => `
    <article class="room-person" data-status="${escapeHtml(person.status)}">
      <span class="dot"></span>
      <div><strong>${escapeHtml(person.name)}${person.role === 'host' ? ' · groepsleider' : ''}</strong><small>${person.ticketType === 'moviepass' ? 'Movie Pass' : 'Gewoon ticket'}${person.seat ? ` · stoel ${escapeHtml(person.seat)}` : ''}</small></div>
      <span class="person-status">${escapeHtml(person.status)}</span>
      ${me?.role === 'host' && person.id !== me.id ? `<button class="remove-participant" type="button" data-participant-id="${escapeHtml(person.id)}" data-participant-name="${escapeHtml(person.name)}">Verwijderen</button>` : ''}
    </article>`).join('');
  document.querySelectorAll('.remove-participant').forEach(button => {
    button.addEventListener('click', () => removeParticipant(button.dataset.participantId, button.dataset.participantName));
  });
  roomBookButton.hidden = !showing || (me?.role !== 'host' && room.state !== 'booking');
  roomDoneButton.hidden = !showing || room.state !== 'booking' || me?.status !== 'boeken';
  roomBookButton.textContent = me?.role === 'host' && room.state !== 'booking' ? 'Start samen boeken' : 'Open mijn Vue-bestelling';
  if (showing) selectedShowing = { ...showing };
}

function showActivityNotice(message) {
  const notice = document.querySelector('#activity-notice');
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 8000);
  if (native?.showGroupNotice) native.showGroupNotice(message);
}

async function removeParticipant(participantId, name) {
  if (!confirm(`${name} uit deze groep verwijderen?`)) return;
  try {
    await updateRoom('remove_participant', { participantId });
  } catch (error) { showGroupError(error); }
}

async function updateRoom(action, extra = {}) {
  if (!groupSession) throw new Error('Maak eerst een groep of neem eraan deel.');
  const result = await syncPost('/api/rooms/update', { code: groupSession.code, token: groupSession.token, action, ...extra });
  applyRoom(result.room);
  return result.room;
}

function clearRoomLocal() {
  clearInterval(roomPollTimer);
  roomPollTimer = null;
  groupSession = null;
  groupRoom = null;
  participantStatuses = new Map();
  clearTimeout(noticeTimer);
  document.querySelector('#activity-notice').hidden = true;
  localStorage.removeItem('moviepass-room-session');
  groupSetup.hidden = false;
  groupLive.hidden = true;
  form.hidden = false;
  groupError.hidden = true;
}

async function leaveRoom() {
  try {
    if (groupSession) await syncPost('/api/rooms/update', { code: groupSession.code, token: groupSession.token, action: 'leave' });
  } catch { /* De lokale uitnodiging wordt ook bij een verbroken verbinding verwijderd. */ }
  clearRoomLocal();
}

function makeLocalPlan(showing) {
  return {
    bookingId: `VMP-${Date.now().toString(36).toUpperCase()}`,
    showing,
    accounts: accounts.map(({ id, name }) => ({ id, name })),
    orders: accounts.map((account, index) => ({ order: index + 1, accountId: account.id, holder: account.name, seat: index ? 'naast vorige stoel' : 'afgesproken groepsstoel', status: 'wachtend' }))
  };
}

async function openRoomBooking() {
  try {
    let room = groupRoom;
    const me = myParticipant();
    if (me?.role === 'host' && room.state !== 'booking') room = await updateRoom('start');
    await updateRoom('status', { status: 'boeken' });
    if (me?.ticketType === 'regular') {
      if (native?.openRegularBooking) native.openRegularBooking(JSON.stringify(room.showing));
      else window.open(`https://www.vuecinemas.nl${room.showing.bookingUrl}`, '_blank', 'noopener');
      return;
    }
    if (!accounts.length) throw new Error('Koppel op dit toestel eerst het Vue-account van deze Movie Pass.');
    const plan = makeLocalPlan(room.showing);
    if (native?.startBooking) native.startBooking(JSON.stringify(plan));
    else window.open(`https://www.vuecinemas.nl${room.showing.bookingUrl}`, '_blank', 'noopener');
  } catch (error) { showGroupError(error); }
}

document.querySelector('#create-room').addEventListener('click', () => createOrJoinRoom('create'));
document.querySelector('#join-room').addEventListener('click', () => createOrJoinRoom('join'));
document.querySelector('#leave-room').addEventListener('click', () => leaveRoom());
document.querySelector('#share-room').addEventListener('click', async () => {
  const text = `Doe mee met mijn Movie Pass-groep. Code: ${groupRoom.code}\nServer: ${groupSession.server}`;
  if (native?.shareText) native.shareText(text);
  else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
});
roomBookButton.addEventListener('click', openRoomBooking);
roomDoneButton.addEventListener('click', async () => {
  try { await updateRoom('status', { status: 'afgerond' }); } catch (error) { showGroupError(error); }
});

function uid() {
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fillDates() {
  const formatter = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  dateSelect.innerHTML = '';
  for (let offset = 0; offset < 14; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    const option = document.createElement('option');
    option.value = localDateValue(date);
    const prefix = offset === 0 ? 'Vandaag · ' : offset === 1 ? 'Morgen · ' : '';
    option.textContent = prefix + formatter.format(date);
    dateSelect.append(option);
  }
}

function loadAccounts() {
  if (native?.listAccounts) {
    try { accounts = JSON.parse(native.listAccounts()); } catch { accounts = []; }
  } else {
    try { accounts = JSON.parse(localStorage.getItem('moviepass-demo-accounts') || '[]'); } catch { accounts = []; }
  }
  renderAccounts();
}

function renderAccounts() {
  accountsBox.innerHTML = '';
  if (!accounts.length) {
    accountsBox.innerHTML = '<p class="empty">Nog geen accounts gekoppeld.</p>';
    return;
  }
  accounts.forEach(account => {
    const card = accountTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('.account-avatar').textContent = account.name.trim().charAt(0).toUpperCase();
    card.querySelector('.account-name').textContent = account.name;
    card.querySelector('.account-status').textContent = account.linked ? 'Vue-sessie gekoppeld ✓' : 'Demo-account · koppel in de Android-app';
    card.querySelector('.remove-account').addEventListener('click', () => removeAccount(account.id));
    accountsBox.append(card);
  });
}

function removeAccount(id) {
  if (native?.removeAccount) native.removeAccount(id);
  else {
    accounts = accounts.filter(account => account.id !== id);
    localStorage.setItem('moviepass-demo-accounts', JSON.stringify(accounts));
    renderAccounts();
  }
  setTimeout(loadAccounts, 100);
}

document.querySelector('#add-account').addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return nameInput.focus();
  const id = uid();
  if (native?.startAccountLink) native.startAccountLink(id, name);
  else {
    accounts.push({ id, name, linked: false });
    localStorage.setItem('moviepass-demo-accounts', JSON.stringify(accounts));
    nameInput.value = '';
    renderAccounts();
  }
});

async function requestSchedule(cinema, date) {
  if (native?.getSchedule) {
    const payload = JSON.parse(native.getSchedule(cinema, date));
    if (payload.error) throw new Error(payload.error);
    return payload;
  }
  const response = await fetch(`/api/vue/schedule?cinema=${encodeURIComponent(cinema)}&date=${encodeURIComponent(date)}`);
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error || 'Programma kon niet worden geladen.');
  return payload;
}

async function loadSchedule() {
  selectedShowing = null;
  currentSchedule = null;
  document.querySelector('#session-id').value = '';
  programBox.innerHTML = '';
  programStatus.hidden = false;
  programStatus.textContent = `Programma voor Vue ${cinemaSelect.value} wordt geladen…`;
  try {
    currentSchedule = await requestSchedule(cinemaSelect.value, dateSelect.value);
    renderSchedule(currentSchedule);
  } catch (error) {
    programStatus.textContent = `${error.message} Controleer je internetverbinding en probeer opnieuw.`;
  }
}

function renderSchedule(schedule) {
  const films = schedule.films || [];
  if (!films.length) {
    programStatus.hidden = false;
    programStatus.textContent = 'Voor deze dag zijn geen boekbare voorstellingen gevonden.';
    return;
  }
  programStatus.hidden = true;
  programBox.innerHTML = films.map(film => `
    <article class="film-card" data-film-id="${escapeHtml(film.filmId)}">
      <div class="film-copy"><strong>${escapeHtml(film.title)}</strong><small>${film.sessions.length} ${film.sessions.length === 1 ? 'vertoning' : 'vertoningen'}</small></div>
      <div class="time-list">
        ${film.sessions.map(session => `
          <button type="button" class="time-button" data-film-id="${escapeHtml(film.filmId)}" data-session-id="${escapeHtml(session.sessionId)}" ${session.isBookingAvailable && !session.isSoldOut ? '' : 'disabled'}>
            <strong>${escapeHtml(session.time)}</strong><small>${escapeHtml(session.screenName || '')}${session.formattedPrice ? ` · ${escapeHtml(session.formattedPrice)}` : ''}</small>
          </button>`).join('')}
      </div>
    </article>`).join('');

  programBox.querySelectorAll('.time-button').forEach(button => {
    button.addEventListener('click', () => selectSession(button.dataset.filmId, button.dataset.sessionId, button));
  });
}

function selectSession(filmId, sessionId, button) {
  const film = currentSchedule?.films.find(item => item.filmId === filmId);
  const session = film?.sessions.find(item => item.sessionId === sessionId);
  if (!film || !session) return;
  selectedShowing = {
    cinema: currentSchedule.cinemaName,
    cinemaId: currentSchedule.cinemaId,
    date: currentSchedule.date,
    film: film.title,
    filmId: film.filmId,
    time: session.time,
    sessionId: session.sessionId,
    bookingUrl: session.bookingUrl,
    screenName: session.screenName,
    formattedPrice: session.formattedPrice
  };
  document.querySelector('#session-id').value = session.sessionId;
  programBox.querySelectorAll('.time-button').forEach(item => item.classList.remove('selected'));
  button.classList.add('selected');
}

function createPlan(input) {
  const roomPerson = myParticipant();
  if (accounts.length < 1 && roomPerson?.ticketType !== 'regular') throw new Error('Koppel minimaal één Vue-account.');
  if (!selectedShowing) throw new Error('Kies eerst een film en één van de echte Vue-tijden.');
  const orders = accounts.length
    ? accounts.map((account, index) => ({ order: index + 1, accountId: account.id, holder: account.name, seat: index ? 'naast vorige stoel' : input.seatPreference, status: 'wachtend' }))
    : [{ order: 1, accountId: '', holder: roomPerson?.name || 'Gewoon ticket', seat: input.seatPreference, status: 'wachtend', ticketType: 'regular' }];
  return {
    bookingId: `VMP-${Date.now().toString(36).toUpperCase()}`,
    showing: { ...selectedShowing, seatPreference: input.seatPreference },
    accounts: accounts.map(({ id, name }) => ({ id, name })),
    orders
  };
}

function render(plan) {
  currentPlan = plan;
  document.querySelector('#result-title').textContent = `${plan.showing.film} · ${plan.showing.time} · Vue ${plan.showing.cinema}`;
  document.querySelector('#order-list').innerHTML = plan.orders.map(order => `
    <article class="order">
      <span class="order-index">${order.order}</span>
      <div><strong>${escapeHtml(order.holder)}</strong><small>eigen Vue-account · sessie ${escapeHtml(plan.showing.sessionId)}</small></div>
      <span class="seat">${order.order === 1 ? 'kies stoel' : '+1'}</span>
    </article>`).join('');
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.hidden = true;
  result.hidden = true;
  submitButton.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const plan = createPlan(data);
    if (groupSession) {
      if (myParticipant()?.role !== 'host') throw new Error('Alleen de groepsleider kan de voorstelling voor de groep kiezen.');
      await updateRoom('set_showing', { showing: plan.showing });
      await updateRoom('status', { status: 'klaar' });
    }
    render(plan);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally { submitButton.disabled = false; }
});

document.querySelector('#open-orders').addEventListener('click', () => {
  if (!currentPlan) return;
  if (groupSession) return openRoomBooking();
  if (!currentPlan.accounts.length && native?.openRegularBooking) return native.openRegularBooking(JSON.stringify(currentPlan.showing));
  if (native?.startBooking) native.startBooking(JSON.stringify(currentPlan));
  else window.open(`https://www.vuecinemas.nl${currentPlan.showing.bookingUrl}`, '_blank', 'noopener');
});

document.querySelector('#copy-plan').addEventListener('click', async event => {
  if (!currentPlan) return;
  const text = [
    `${currentPlan.showing.film} – Vue ${currentPlan.showing.cinema}`,
    `${currentPlan.showing.date} om ${currentPlan.showing.time} (${currentPlan.showing.screenName || 'zaal onbekend'})`,
    ...currentPlan.orders.map(order => `${order.order}. ${order.holder}: ${order.order === 1 ? 'kies eerste stoel' : 'stoel ernaast'}`)
  ].join('\n');
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  event.currentTarget.textContent = 'Gekopieerd ✓';
  setTimeout(() => { event.currentTarget.textContent = 'Plan kopiëren'; }, 1800);
});

cinemaSelect.addEventListener('change', loadSchedule);
dateSelect.addEventListener('change', loadSchedule);
document.querySelector('#refresh-program').addEventListener('click', loadSchedule);

fillDates();
loadAccounts();
loadSchedule();
loadGroupSession();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js');
