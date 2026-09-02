# Architecture

A Next.js 16 app on Vercel, Postgres on Neon, and no other services in the request path. This page is the map: how a request flows, how the cache stays honest, and where each kind of code lives.

## Layout

```
app/            routes, layouts, Open Graph images, and the server actions (app/actions/*)
components/     React components; Client Components carry "use client"
lib/            everything that is not a route
  market.ts     the scoring formulas, pure
  engine.ts     reads the database into a World and runs the formulas on it
  book.ts       planning a Book commit, shared by the editor and the server
  db/           SQL, one module per domain (users, startups, comments, book, scores, parties, markets, rate, meta)
  db/index.ts   the driver: pool, placeholders, transactions, bootstrap gate
  db/schema.ts  the whole schema as one string, fingerprinted into a version
  guard.ts      rate limits and the transaction they share with the write
  auth.ts       password hashing and the signed session cookie
  tags.ts       cache tags
  share.ts      page metadata and link-preview copy
  og*.tsx       the cards behind every link preview
data/catalog.json   the companies every deploy starts with, and their opening lines
test/           vitest: unit/ for pure modules, the rest drives a real Postgres
docs/           this
```

## A request

Every page is a static shell with Suspense boundaries; whatever depends on the URL or the viewer streams into it. Server Components read through `"use cache"` functions (`cachedFeed`, `cachedThread`, `cachedWorldData`, and friends) that carry **cache tags** from `lib/tags.ts`. A server action does its write, then calls `updateTag` for every tag that write touched, so the re-render that ships with the action's response already shows it. The tests in `test/cache.test.ts` pin which tags each reader declares and each action expires.

Anything about the viewer (their session, votes, flags, standing, the header numbers) is read behind `"use cache: private"`, kept only in the browser's router cache, and overlaid client-side on the shared lists. That is what lets one cached front page serve every visitor.

Votes, replies, and position changes render optimistically (`useOptimistic`) and are confirmed by the server's re-render. Links into a company prefetch on hover (`IntentLink`), so a page of forty links costs one shell, not forty renders.

## Time

Cached output carries the moment it was built (`cachedNow`), and client rows move the clock forward after hydration (`useNow`), a minute at a time, so relative ages stay right while a page sits open. Server Components that read uncached data may use the real clock (`nowMs`); the ones that read only cached data must not, or their prerender would stop being cacheable.

## The database

Plain SQL through a thin driver (`lib/db/index.ts`):

- `?` placeholders are rewritten to `$n`. A literal `?` cannot appear in SQL text.
- `withTransaction(fn)` runs `fn` on one client; nested calls join the open transaction. Queries issued together inside a transaction are serialized on that client.
- Rows are decoded at the edge with `lib/db/codec.ts` (`str`, `int`, `intNull`, ...), which throws on a shape it does not expect rather than passing `undefined` along.
- Locally the driver is `pg`; for any non-local host it is Neon's serverless driver with `sslmode=require`.

**Bootstrap.** The first query on a server instance checks two version markers in the `meta` table. If the schema fingerprint (`SCHEMA_VERSION`, an FNV-1a hash of `lib/db/schema.ts`) differs, the schema statements are replayed (`CREATE ... IF NOT EXISTS`) and `lib/db/migrate.ts` adds any columns that postdate the first schema. If the catalog fingerprint differs, `data/catalog.json` is seeded. Nothing else runs at boot. There is no migration tool: to change the schema, edit `schema.ts` (and `migrate.ts` for an `ALTER` an existing database needs), and the next instance applies it.

## The world

`lib/engine.ts` reads everything scoring needs in eight queries and keeps it as a `World`: users and their standing, each company's lots (who held what, when), every touch (events and comments), and open positions. Every market number is computed from that in memory, per request, and memoized per company. The whole world is one cache entry tagged `world`, expired by any write that changes it. Scoring is `lib/market.ts`, which knows nothing about the database; see [scoring.md](scoring.md).

Writes score against the world as it stood before the write: inside a transaction, `loadWorld` reads fresh so a batch of Book changes prices every lot consistently.

## Writes

Every mutation is a server action in `app/actions/`. The shape is the same everywhere: read the session (never from cache), validate, run moderation, then `guarded(kind, user, write)`. `guarded` opens a transaction, takes an advisory lock per actor, checks the rate limit for that kind of write, runs the write, and logs it, so parallel requests cannot all pass the gap check. Errors the user can act on are thrown as `GuardError`, `BookError`, `PartyError`, and come back as `{ error }` for `useActionState`; anything else propagates.

Public text goes through OpenAI's moderation endpoint when `OPENAI_API_KEY` is set; sign-up and login go through Cloudflare Turnstile when its keys are set. Both are required in production and skipped locally.

## Trust

Anyone can vote and play the moment they sign up. What changes with standing is weight: an **accounted** user counts toward Pulse, Depth, and Hotness, and their comment votes weigh 1; a provisional user's votes weigh 0.1. An account becomes accounted after 7 days, 3 companies touched, and an upvote from a trusted or X-verified member, or at once when the admin marks it trusted or the user links a checkmarked X account by putting a short code in their bio (checked through twitterapi.io). One X account can vouch for one user. Muted accounts count for nothing anywhere. The `admin` account is whoever registers that username.

## Open Graph cards

Every shareable page has an image: the company, a long or short intent, a take, a profile's Book, a party, an invite. They render with `next/og` (satori) in `lib/og*.tsx`, with text measured ahead of time in `lib/og-fit.ts` so a card picks the largest size that fits. `/og/gallery` (admin only in production) shows every card on fixtures that each stress one thing, and `/og/preview` (development only) renders one from query parameters.

## Tests

`npm test` runs both projects in `vitest.config.mts`. The `unit` project covers the pure modules. The `integration` project starts a throwaway Postgres through testcontainers (or uses `TEST_DATABASE_URL`), applies the real schema, and drives the server actions and queries against it with `next/headers`, `next/navigation`, and `next/cache` mocked (`test/harness/setup.ts`); every table is truncated between tests. `test/harness/factories.ts` has the vocabulary: `makeUser`, `makeStartup`, `establish`, `openPosition`, `thesis`, `vote`, and a frozen clock.
