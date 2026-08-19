// HMXLive Soundcheck — shared leaderboard
//
// GET  /api/scores  -> returns the top 10 as JSON
// POST /api/scores  -> body {name, score, lvl} ; returns the updated top 10
//
// Storage is Netlify Blobs, which is built into Netlify — no database to
// set up, no API keys. The board lives in one JSON blob.
//
// Everything is validated server-side. Never trust the client: the score
// is just a number in a POST body, so anyone can curl a fake one. The
// caps below keep a bad request from corrupting the board, but they are
// NOT anti-cheat — see the README.

import { getStore } from '@netlify/blobs';

// board-v2: the board was reset when names became three-letter initials, so the
// old twelve-character entries aren't mixed in with them.
const KEY = 'board-v2';
const MAX_ENTRIES = 10;
const MAX_SCORE = 200000;   // 10 levels * (600 time + 750 lives + 500 clear) has plenty of headroom

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const clean = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .filter((e) => e && typeof e.score === 'number' && isFinite(e.score))
    .map((e) => ({
      // Three initials, cabinet style. Enforced here as well as in the page,
      // because the page is not the only thing that can POST.
      name: String(e.name ?? 'AAA').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AAA',
      score: Math.max(0, Math.min(MAX_SCORE, Math.floor(e.score))),
      lvl: Math.max(0, Math.min(99, Math.floor(Number(e.lvl) || 0))),
      when: Number(e.when) || Date.now(),
    }))
    .sort((a, b) => b.score - a.score || a.when - b.when)
    .slice(0, MAX_ENTRIES);

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: JSON_HEADERS });
  }

  let store;
  try {
    store = getStore('soundcheck');
  } catch (err) {
    return new Response(JSON.stringify([]), { status: 200, headers: JSON_HEADERS });
  }

  // ---- read ----
  if (request.method === 'GET') {
    try {
      const raw = await store.get(KEY, { type: 'json' });
      return new Response(JSON.stringify(clean(raw)), { status: 200, headers: JSON_HEADERS });
    } catch (err) {
      return new Response(JSON.stringify([]), { status: 200, headers: JSON_HEADERS });
    }
  }

  // ---- write ----
  if (request.method === 'POST') {
    let entry;
    try {
      entry = await request.json();
    } catch (err) {
      return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: JSON_HEADERS });
    }

    const score = Math.floor(Number(entry?.score));
    if (!isFinite(score) || score <= 0 || score > MAX_SCORE) {
      return new Response(JSON.stringify({ error: 'bad score' }), { status: 400, headers: JSON_HEADERS });
    }

    const row = clean([{ name: entry?.name, score, lvl: entry?.lvl, when: Date.now() }])[0];

    // Read-modify-write. Two people finishing in the same second could race
    // and one write could clobber the other; for a handful of friends that's
    // acceptable. A retry loop would need compare-and-set, which Blobs
    // doesn't expose directly.
    let current = [];
    try {
      current = (await store.get(KEY, { type: 'json' })) || [];
    } catch (err) {
      current = [];
    }

    const next = clean([...(Array.isArray(current) ? current : []), row]);

    try {
      await store.setJSON(KEY, next);
    } catch (err) {
      // Couldn't persist — still hand back the merged board so the client
      // shows something sensible rather than an error.
      return new Response(JSON.stringify(next), { status: 200, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify(next), { status: 200, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: JSON_HEADERS });
};

export const config = { path: '/api/scores' };
