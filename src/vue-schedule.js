const BASE = 'https://www.vuecinemas.nl';

function cookiePairs(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie') || ''];
  return values.map(value => value.split(';', 1)[0]).filter(Boolean).join('; ');
}

async function vueJson(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  if (!response.ok) throw new Error(`Vue gaf foutcode ${response.status}.`);
  return { payload: await response.json(), cookies: cookiePairs(response.headers) };
}

export function normalizeSchedule(payload, cinema, date) {
  const films = Array.isArray(payload?.result) ? payload.result : [];
  return {
    cinemaId: String(cinema.cinemaId),
    cinemaName: cinema.cinemaName,
    date,
    films: films.map(film => ({
      filmId: String(film.filmId),
      title: film.filmTitle,
      sessions: (film.showingGroups || []).flatMap(group => group.sessions || []).map(session => ({
        sessionId: String(session.sessionId),
        time: String(session.startTime || '').slice(11, 16),
        startTime: session.startTime,
        bookingUrl: session.bookingUrl,
        formattedPrice: session.formattedPrice || '',
        screenName: session.screenName || '',
        isSoldOut: Boolean(session.isSoldOut),
        isBookingAvailable: Boolean(session.isBookingAvailable)
      }))
    })).filter(film => film.sessions.length > 0)
  };
}

export async function fetchVueSchedule(cinemaName, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Ongeldige datum.');
  const token = await vueJson('/api/microservice/auth/token', { method: 'POST', headers: { accept: 'application/json' } });
  const cinemasResponse = await vueJson('/api/microservice/showings/cinemas', { headers: { cookie: token.cookies } });
  const cinemas = (cinemasResponse.payload.result || []).flatMap(group => group.cinemas || []);
  const cinema = cinemas.find(item => item.cinemaName.toLocaleLowerCase('nl-NL') === cinemaName.toLocaleLowerCase('nl-NL'));
  if (!cinema) throw new Error(`Vue ${cinemaName} is niet gevonden.`);
  const cookies = [token.cookies, cinemasResponse.cookies].filter(Boolean).join('; ');
  const query = new URLSearchParams({ showingDate: date, includesSession: 'true', includeSessionAttributes: 'true', minEmbargoLevel: '1' });
  const schedule = await vueJson(`/api/microservice/showings/cinemas/${encodeURIComponent(cinema.cinemaId)}/films?${query}`, { headers: { cookie: cookies } });
  return normalizeSchedule(schedule.payload, cinema, date);
}
