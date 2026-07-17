export function validateAccount(account, index) {
  const id = String(account?.id ?? '').trim();
  const name = String(account?.name ?? '').trim();
  if (!id) throw new Error(`Account ${index + 1} mist een id.`);
  if (!name) throw new Error(`Vul de naam van pashouder ${index + 1} in.`);
  return { id, name };
}

export function createBookingPlan(input) {
  const cinema = String(input?.cinema ?? '').trim();
  const cinemaId = String(input?.cinemaId ?? '').trim();
  const film = String(input?.film ?? '').trim();
  const filmId = String(input?.filmId ?? '').trim();
  const date = String(input?.date ?? '').trim();
  const time = String(input?.time ?? '').trim();
  const sessionId = String(input?.sessionId ?? '').trim();
  const bookingUrl = String(input?.bookingUrl ?? '').trim();
  const seatPreference = String(input?.seatPreference ?? 'center').trim();
  const accounts = Array.isArray(input?.accounts) ? input.accounts.map(validateAccount) : [];

  if (!cinema) throw new Error('Kies een Vue-bioscoop.');
  if (!film) throw new Error('Vul de film in.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Kies een geldige datum.');
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Kies een geldige tijd.');
  if (!cinemaId || !filmId || !sessionId || !bookingUrl.startsWith('/')) throw new Error('Kies een echte Vue-vertoning.');
  if (accounts.length < 1) throw new Error('Koppel minimaal één Vue-account.');
  if (new Set(accounts.map(account => account.id)).size !== accounts.length) throw new Error('Hetzelfde Vue-account is dubbel toegevoegd.');

  return {
    bookingId: `VMP-${Date.now().toString(36).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    showing: { cinema, cinemaId, film, filmId, date, time, sessionId, bookingUrl, seatPreference },
    accounts,
    orders: accounts.map((account, index) => ({
      order: index + 1,
      accountId: account.id,
      holder: account.name,
      seat: index === 0 ? seatPreference : 'naast vorige stoel',
      status: 'wachtend'
    }))
  };
}
