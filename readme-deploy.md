# HMXLive Soundcheck — deploy

Netlify builds this from GitHub: **tpm08150/hmxlive-soundcheck**. A push to
`main` deploys.

## The one thing to know

There are two possible versions of the leaderboard function, and which one is
correct depends entirely on how the site deploys.

| Deploy method | Correct function |
| --- | --- |
| **Git (what we use)** | `import { getStore } from '@netlify/blobs'` — Netlify runs `npm install`, so the dependency resolves |
| Drag-and-drop | A dependency-free version that calls the blob store over `fetch` — drag-and-drop runs no build, so any `import` crashes |

This repo is set up for **Git**, so `package.json` stays and the function keeps
its import.

⚠️ **This bit the project once already.** The site was on drag-and-drop, the
function imported `@netlify/blobs`, nothing installed it, and the function
crashed on that line. `/api/scores` errored and the game fell back to
local-only scores — which it does silently, by design, so nothing looked
broken. If you ever move back to drag-and-drop, the import has to go.

A dependency-free copy of the function used to sit in the working folder at
`scores.mjs`, plus two more under a misspelled `netifly/` directory. None of
them were in the deploy path, so editing them changed nothing. They are
deliberately not in this repo.

## Files

```
index.html          <- the game; the bare domain serves it
netlify.toml        <- publish dir, the old-filename redirect, API cache header
package.json        <- declares @netlify/blobs for the build
netlify/
  functions/
    scores.mjs      <- the leaderboard API, routed to /api/scores
```

The `netlify/functions/` nesting is the one thing that must not be flattened;
that path is how Netlify finds the function.

`README-deploy.md` is just notes — it doesn't matter if it ships.

The `netlify/functions/` nesting is the one thing that must not be flattened;
that path is how Netlify finds the function.

**Why `index.html`?** Netlify serves the root of your domain by looking for a
file called exactly `index.html`. With the old name, `hmxsoundcheck.netlify.app`
404'd and you had to use the full `/hmxlive-soundcheck.html` path. Now the bare
link works, which is what you want for sharing. `netlify.toml` also 301s the
old filename to the root, so any bookmark still lands correctly.

## Verify

After the deploy finishes, open:

```
https://hmxsoundcheck.netlify.app/api/scores
```

| You see | Meaning |
| --- | --- |
| `[]` | Working. Empty board, nothing posted yet. |
| A score list | Working, and someone's already on the board. |
| 404 | Function didn't deploy — check the folder nesting. |

In-game, the leaderboard header tells you which backend is live:

| Header | Meaning |
| --- | --- |
| `TOP 10 — LIVE` | Real shared server. This is what you want. |
| `TOP 10 — SHARED` | Artifact storage (only inside the Claude interface). |
| `TOP 10 — LOCAL ONLY (NO SERVER)` | No backend. Scores are per-browser. |

## Scoring

Per level: **time left × 10** + **lives × 250** + **500 clear bonus**.

The 60-second clock stops during Union 15 (the break is mandated, so it can't
cost you). Running out of time doesn't kill you — you just stop earning the
time bonus for that level. A run ends when you finish level 10 or lose all
lives; either way, a top-10 total prompts for a name.

## Cheating

The score is a number in a POST body. Anyone with devtools can send whatever
they like, and no client-side code can prevent that. The function validates
shape, strips HTML from names, and clamps scores to a ceiling — so a bad
request can't corrupt the board or inject anything — but it can't tell a real
8,000 from an invented one.

For coworkers, that's almost certainly fine. If someone spikes the board, wipe
it: change `KEY` in `scores.mjs` from `board-v1` to `board-v2` and redeploy.
That starts a fresh blob and abandons the old one.

## Concurrency

The function does read-modify-write. Two people finishing within the same
second could have one write clobber the other. A non-issue at your scale.

## If you ever switch to Git deploys

Everything here still works unchanged — a dependency-free function is fine in
a Git deploy too. You'd just gain the option of using `@netlify/blobs` if you
ever wanted its niceties (strong consistency, conditional writes).
