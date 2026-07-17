import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBookingPlan } from './src/booking.js';
import { fetchVueSchedule } from './src/vue-schedule.js';
import { RoomStore } from './src/rooms.js';
import { RateLimiter } from './src/rate-limit.js';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const rooms = new RoomStore();
const limiter = new RateLimiter();
const clientSalt = randomBytes(24).toString('hex');
const trustProxy = process.env.TRUST_PROXY === 'true';
const publicSyncUrl = String(process.env.PUBLIC_SYNC_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '')).replace(/\/+$/, '');
const projectUrl = String(process.env.GITHUB_REPOSITORY_URL || '').replace(/\/+$/, '');

const rateRules = {
  create: { limit: 12, windowMs: 10 * 60 * 1000 },
  join: { limit: 30, windowMs: 10 * 60 * 1000 },
  read: { limit: 180, windowMs: 5 * 60 * 1000 },
  update: { limit: 100, windowMs: 5 * 60 * 1000 },
  schedule: { limit: 60, windowMs: 10 * 60 * 1000 }
};

setInterval(() => limiter.cleanup(), 10 * 60 * 1000).unref();

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 30_000) throw new Error('Aanvraag is te groot.');
  }
  return JSON.parse(raw || '{}');
}

function clientKey(req, action) {
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const address = forwarded || req.socket.remoteAddress || 'unknown';
  return createHash('sha256').update(`${clientSalt}:${address}:${action}`).digest('hex');
}

function rateLimit(req, action) {
  limiter.check(clientKey(req, action), rateRules[action]);
}

async function serveStatic(req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const requested = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = join(root, safe);

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not-file');
    const content = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': safe === 'sw.js' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'cross-origin-opener-policy': 'same-origin',
      'strict-transport-security': 'max-age=31536000; includeSubDomains'
    });
    res.end(content);
  } catch {
    json(res, 404, { error: 'Bestand niet gevonden.' });
  }
}

function servePublicConfig(res) {
  const safeSyncUrl = JSON.stringify(publicSyncUrl).replace(/</g, '\\u003c');
  const safeProjectUrl = JSON.stringify(projectUrl).replace(/</g, '\\u003c');
  res.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(`window.MoviePassConfig=Object.freeze({syncServer:${safeSyncUrl},projectUrl:${safeProjectUrl}});`);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      return json(res, 200, { ok: true, version: '0.7.0', mode: 'public-beta', storage: 'temporary' });
    }

    if (req.method === 'GET' && req.url === '/config.js') {
      return servePublicConfig(res);
    }

    if (req.method === 'POST' && req.url === '/api/booking/plan') {
      const plan = createBookingPlan(await body(req));
      return json(res, 200, plan);
    }

    if (req.method === 'POST' && req.url === '/api/rooms/create') {
      rateLimit(req, 'create');
      return json(res, 200, rooms.create(await body(req)));
    }

    if (req.method === 'POST' && req.url === '/api/rooms/join') {
      rateLimit(req, 'join');
      return json(res, 200, rooms.join(await body(req)));
    }

    if (req.method === 'POST' && req.url === '/api/rooms/read') {
      rateLimit(req, 'read');
      return json(res, 200, rooms.read(await body(req)));
    }

    if (req.method === 'POST' && req.url === '/api/rooms/update') {
      rateLimit(req, 'update');
      return json(res, 200, rooms.update(await body(req)));
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/vue/schedule?')) {
      rateLimit(req, 'schedule');
      const url = new URL(req.url, 'http://localhost');
      const cinema = String(url.searchParams.get('cinema') || '').trim();
      const date = String(url.searchParams.get('date') || '').trim();
      if (!cinema) return json(res, 400, { error: 'Kies een bioscoop.' });
      return json(res, 200, await fetchVueSchedule(cinema, date));
    }

    if (req.url?.startsWith('/api/')) {
      return json(res, 404, { error: 'Onbekende API-aanroep.' });
    }

    return serveStatic(req, res);
  } catch (error) {
    const status = Number(error.statusCode || 400);
    const headers = error.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
    return json(res, status, { error: error.message || 'De aanvraag kon niet worden verwerkt.' }, headers);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Vue Movie Pass Groepsboeker draait op http://localhost:${port}`);
});
