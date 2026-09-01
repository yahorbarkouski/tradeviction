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

Open [http://localhost:3000](http://localhost:3000). The catalog seeds itself on the home page.

## Stack

Next.js on Vercel. Postgres on Neon. Auth is username plus password in a signed cookie.

## Tests

`npm test` runs the integration suite in `test/`. It starts a throwaway Postgres with Docker through testcontainers, applies the real schema and migrations, and drives the server actions, queries, and market engine against it; every table is truncated between tests. To reuse a database you already run, set `TEST_DATABASE_URL` (for example the compose one: `postgres://tradeviction:tradeviction@127.0.0.1:5432/tradeviction_test`). Never point it at real data.

## Trust

Anyone can vote the moment they sign up, and the number on a comment counts every unmuted vote. Ranking weighs votes from established accounts (7 days old, 3 companies touched) in full and votes from newer accounts at one tenth; the front page also decays with a 48-hour half-life. The `admin` account can mark a user trusted from their profile, which counts them as established at once in rankings, karma, and pulse. Muted accounts count for nothing anywhere.
