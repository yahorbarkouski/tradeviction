# Tradeviction

You bet conviction, not money. LONG or SHORT a startup. Pulse is who is staking at least 1 Conviction. One person, one vote.

## Run

```bash
npm install
cp .env.example .env.local
```

Set `DATABASE_URL` to a Neon connection string and `SESSION_SECRET` to a long random value.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The schema and the catalog are applied the first time a server instance touches the database, and only when their version markers in the `meta` table differ from the code.

## Stack

Next.js on Vercel. Postgres on Neon. Auth is username plus password in a signed cookie.

## Speed

Pages use Cache Components: every route ships a static shell, and whatever depends on the URL or the viewer streams into it. Shared reads (`cachedWorldData`, `cachedFrontPage`, `cachedThread`, `cachedFeed`, `cachedLeaders`, `cachedStartupBySlug`) carry cache tags from `lib/tags.ts`; every server action expires the tags its write touched with `updateTag`, so the re-render that ships with the action's response already shows the write. Viewer-specific state (votes, flags, standing, the header numbers) is read behind `use cache: private`, kept only in the browser, and overlaid on the shared lists client side. Votes, replies, and position changes render optimistically and are confirmed by the server's re-render. Links to feeds and the leaderboard prefetch their content; links into a startup prefetch it on hover.

## Parties

A party is a private board, like an Advent of Code leaderboard. Make one on `/parties`, share its invite link (`/join/<code>`, a 32-character secret behind a copy button), and everyone who joins sees the members ranked by Alpha with what each is long and short. Party and invite links unfurl with a card of the top five. The owner can replace the link or delete the party; an owner who leaves hands the party to whoever joined next, and the last member out takes it with them.

## Book

Your own profile is where the portfolio gets built. Every open position is a row with its side and Conviction as live controls, a bar shows how the hundred is spread, and a search box adds companies from the catalog, with the hottest boards offered before you type. Edits stage in the browser: a change list spells out what each one does and whether it spends a move, and one Commit (or Cmd+Enter) sends them all as a single server action. The batch is checked as a whole against the cap and the day's moves, then lands in one transaction that frees Conviction before spending it, so shifting 60 from one company to another is one step. Any failure, including a page whose view of the Book is older than the database, leaves the Book untouched.

## Tests

`npm test` runs the integration suite in `test/`. It starts a throwaway Postgres with Docker through testcontainers, applies the real schema and migrations, and drives the server actions, queries, and market engine against it; every table is truncated between tests. To reuse a database you already run, set `TEST_DATABASE_URL` (for example the compose one: `postgres://tradeviction:tradeviction@127.0.0.1:5432/tradeviction_test`). Never point it at real data.

## Trust

Anyone can vote the moment they sign up, and the number on a take counts every unmuted vote. Ranking weighs votes from established accounts in full and votes from newer accounts at one tenth; the front page also decays with a 48-hour half-life. An account is established once it is 7 days old, has touched 3 companies, and a trusted or X-verified member has upvoted one of its takes. Two things establish it at once: the `admin` account marking it trusted from its profile, or the user linking an X account that carries a checkmark by putting a short code in their bio, which the site checks through twitterapi.io (`TWITTERIO_API_KEY`). One X account can vouch for one user. Muted accounts count for nothing anywhere.
